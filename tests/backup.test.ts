import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBackup, pruneBackups, readManifest, restoreBackup, timestamp, verifyBackup } from "@/db/backup";
import { demoCatalog } from "@/content/catalog";
import { user } from "@/db/schema";
import { saveProductChange } from "@/features/catalog/overrides";
import { createInquiry, getInquiryFor, hashToken } from "@/features/inquiries/service";
import { storeUpload } from "@/server/media";
import { LocalStore } from "@/server/storage";
import { openTestDb, type TestDb } from "./helpers/pg";

let dir: string;
let uploads: string;
const now = new Date();
const actor = { id: "u1", email: "dueno@example.com" };
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-"));
  uploads = path.join(dir, "uploads");
  process.env.UPLOADS_DIR = uploads;
  process.env.STORAGE_DRIVER = "local";
});
afterEach(async () => {
  delete process.env.UPLOADS_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Datos de todos los tipos: cuentas, precios del panel, historial, una consulta (con líneas de identidad) y una foto. */
async function seed(db: TestDb) {
  await db.insert(user).values([{ id: "ana", name: "Ana", email: "ana@example.com", emailVerified: true, createdAt: now, updatedAt: now }, { id: "beto", name: "Beto", email: "beto@example.com", emailVerified: false, createdAt: now, updatedAt: now }]);
  await saveProductChange(db, demoCatalog.products, "storm-sobre", { priceUsdMinor: 1000, stock: 7, expectedVersion: 0 }, actor, 1_700_000_000_000);
  const body = { items: [{ productId: "storm-sobre", quantity: 1, expectedPriceMinor: 1230000 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", idempotencyKey: "clave-de-prueba-000001" };
  const { inquiry } = await createInquiry(db, body, { sessionTokenHash: hashToken("s"), userId: "ana", fx: { status: "manual", mode: "manual", rate10k: 12_340_000, asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false } });
  const img = await sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 1, g: 100, b: 50 } } }).png().toBuffer();
  const photo = await storeUpload(db, { data: img, uploadedByEmail: actor.email });
  return { ref: inquiry.reference, photo };
}

describe("respaldo y restauración de PostgreSQL + fotos", () => {
  it("el respaldo es íntegro: tablas con huella, fotos con huella, sin sesiones", async () => {
    const db = await openTestDb();
    const { photo } = await seed(db);
    const { path: out, manifest } = await createBackup({ url: db.testUrl, dir: path.join(dir, "backups"), store: new LocalStore(), now: new Date(2026, 9, 12, 10, 30, 0) });
    expect(path.basename(out)).toBe("tienda-20261012-103000");
    expect(verifyBackup(out)).toEqual([]);
    expect(manifest.tables.user.rows).toBe(2);
    expect(manifest.tables.inquiry_lines.rows).toBe(1);
    expect(manifest.tables.session).toBeUndefined(); // datos volátiles fuera
    expect(manifest.storage.map((f) => f.name).sort()).toEqual([photo.id, photo.id.replace(".webp", "-t.webp")].sort()); // foto y miniatura
  });

  it("detecta un respaldo alterado (fila modificada, foto cambiada o faltante)", async () => {
    const db = await openTestDb();
    const { photo } = await seed(db);
    const { path: out } = await createBackup({ url: db.testUrl, dir: path.join(dir, "backups"), store: new LocalStore() });
    const f = path.join(out, "data", "user.ndjson");
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("Ana", "Eva"));
    expect(verifyBackup(out).join(" ")).toMatch(/tabla user/);
    fs.writeFileSync(path.join(out, "storage", photo.id), "otra cosa");
    expect(verifyBackup(out).join(" ")).toMatch(/foto .* alterada/);
    fs.rmSync(path.join(out, "storage", photo.id));
    expect(verifyBackup(out).join(" ")).toMatch(/falta la foto/);
    fs.rmSync(path.join(out, "manifest.json"));
    expect(verifyBackup(out)[0]).toMatch(/no es un respaldo/);
  });

  it("restaurar en una base y un bucket vacíos reproduce los datos y los archivos, y la identidad sigue desde el máximo", async () => {
    const src = await openTestDb();
    const { ref, photo } = await seed(src);
    const { path: out, manifest } = await createBackup({ url: src.testUrl, dir: path.join(dir, "backups"), store: new LocalStore() });
    fs.rmSync(uploads, { recursive: true, force: true }); // bucket nuevo y vacío
    const dst = await openTestDb();
    const r = await restoreBackup({ backupDir: out, url: dst.testUrl, store: new LocalStore(), safetyDir: path.join(dir, "seguridad") });
    expect(r.photos).toBe(2);
    expect(r.rows.user).toBe(2);
    expect(fs.existsSync(path.join(uploads, photo.id))).toBe(true);
    // Mismas huellas que el respaldo (restoreBackup ya lo verifica; acá además se lee con el servicio real).
    expect((await getInquiryFor(dst, ref, { userId: "ana" }))?.lines[0]).toMatchObject({ unitPriceUsdMinor: 1000, unitPriceMinor: 1_230_000 });
    expect(readManifest(out).tables.user.sha256).toBe(manifest.tables.user.sha256);
    // La secuencia de identidad continúa después del máximo: una consulta nueva no choca con el id de la línea restaurada.
    const body2 = { items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: 1230000 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", idempotencyKey: "clave-de-prueba-000002" };
    const again = await createInquiry(dst, body2, { sessionTokenHash: hashToken("s"), userId: "ana", fx: { status: "manual", mode: "manual", rate10k: 12_340_000, asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false } });
    expect(again.inquiry.lines).toHaveLength(1);
  });

  it("no restaura sobre un destino con datos salvo --reemplazar, y antes guarda un respaldo de seguridad", async () => {
    const a = await openTestDb();
    await seed(a);
    const { path: out } = await createBackup({ url: a.testUrl, dir: path.join(dir, "backups"), store: new LocalStore() });
    const b = await openTestDb();
    await b.insert(user).values({ id: "otro", name: "Otro", email: "otro@example.com", emailVerified: true, createdAt: now, updatedAt: now });
    await expect(restoreBackup({ backupDir: out, url: b.testUrl, store: new LocalStore(), safetyDir: path.join(dir, "seg") })).rejects.toThrow(/no está vacío/);
    expect(fs.existsSync(path.join(dir, "seg"))).toBe(false);
    const r = await restoreBackup({ backupDir: out, url: b.testUrl, store: new LocalStore(), replace: true, safetyDir: path.join(dir, "seg") });
    expect(r.safety && fs.existsSync(r.safety)).toBe(true);
    expect(path.basename(r.safety!)).toMatch(/^pre-restauracion-/);
    const rows = await b.select({ id: user.id }).from(user);
    expect(rows.map((x) => x.id).sort()).toEqual(["ana", "beto"]); // «otro» ya no está (reemplazo), pero quedó en el respaldo de seguridad
    expect(readManifest(r.safety!).tables.user.rows).toBe(1);
  });

  it("un respaldo inválido no toca nada", async () => {
    const b = await openTestDb();
    fs.mkdirSync(path.join(dir, "falso"));
    await expect(restoreBackup({ backupDir: path.join(dir, "falso"), url: b.testUrl, safetyDir: path.join(dir, "seg") })).rejects.toThrow(/no es válido/);
  });

  it("pruneBackups deja las N carpetas más recientes y no toca otras", async () => {
    const bdir = path.join(dir, "backups");
    for (const t of ["20261010-100000", "20261011-100000", "20261012-100000"]) fs.mkdirSync(path.join(bdir, `tienda-${t}`), { recursive: true });
    fs.mkdirSync(path.join(bdir, "otra-cosa"));
    expect(pruneBackups(bdir, 2)).toEqual(["tienda-20261010-100000"]);
    expect(fs.readdirSync(bdir).sort()).toEqual(["otra-cosa", "tienda-20261011-100000", "tienda-20261012-100000"]);
    expect(timestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe("20260102-030405");
  });
});

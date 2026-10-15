import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeMigration, openSourceCopy, planMigration } from "@/db/sqlite-import";
import { adminSettings, favorites, inquiries, inquiryLines, mediaAssets, productAudit, productOverrides, user } from "@/db/schema";
import { buildLegacySqlite } from "./helpers/legacy-sqlite";
import { openTestDb } from "./helpers/pg";

let dir: string;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "migracion-")); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const BIG_MS = 1_792_000_000_000; // ~2026: no cabe en 32 bits
const BIG_MONEY = 3_000_000_000; // $30.000.000,00 en centavos: tampoco

/** SQLite original con un dato de cada tipo (booleanos 0/1, milisegundos, ids autoincrementales con huecos, importes enormes, NULL). */
function sembrar(file: string) {
  const db = buildLegacySqlite(file);
  db.prepare("insert into user (id, name, email, email_verified, created_at, updated_at) values (?,?,?,?,?,?)").run("u1", "Dueña", "dueno@example.com", 1, BIG_MS, BIG_MS);
  db.prepare("insert into user (id, name, email, email_verified, created_at, updated_at) values (?,?,?,?,?,?)").run("u2", "Cliente", "cli@example.com", 0, BIG_MS + 5, BIG_MS + 5);
  db.prepare("insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (?,?,?,?,?,?,?)").run("a1", "u1", "credential", "u1", "scrypt$hash-opaco", BIG_MS, BIG_MS);
  db.prepare("insert into session (id, expires_at, token, created_at, updated_at, user_id) values (?,?,?,?,?,?)").run("s1", BIG_MS + 1e9, "tok", BIG_MS, BIG_MS, "u1");
  db.prepare("insert into favorites (user_id, product_id, created_at) values (?,?,?)").run("u2", "storm-sobre", BIG_MS);
  db.prepare("insert into inquiries (id, idempotency_key, content_hash, session_token_hash, user_id, status, currency, subtotal_minor, discount_minor, fx_rate_10k, fx_mode, fx_source, fx_as_of, delivery_method, delivery_json, payment_preference, contact_name, message, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("TT-AAAAAAAA", "clave-1", "h", "sess", "u2", "consulta_preparada", "ARS", BIG_MONEY, 300_000_000, 15_500_000, "auto", "DolarAPI", BIG_MS, "retiro", "{\"method\":\"retiro\"}", "coordinar", null, "mensaje con «acentos» ñ", BIG_MS);
  db.prepare("insert into inquiry_lines (id, inquiry_id, product_id, sku, title, language, quantity, fulfillment, unit_price_usd_minor, unit_price_minor, line_subtotal_minor) values (?,?,?,?,?,?,?,?,?,?,?)").run(7, "TT-AAAAAAAA", "storm-caja", "SKU1", "Caja", "ja", 2, "stock", 12000, 1_500_000_000, BIG_MONEY);
  db.prepare("insert into inquiry_lines (id, inquiry_id, product_id, sku, title, language, quantity, fulfillment, unit_price_usd_minor, unit_price_minor, line_subtotal_minor) values (?,?,?,?,?,?,?,?,?,?,?)").run(12, "TT-AAAAAAAA", "storm-sobre", "SKU2", "Sobre", "ja", 1, "encargo", null, 0, 0);
  db.prepare("insert into product_overrides (product_id, price_minor, price_usd_minor, title, description, order_only, stock_quantity, max_per_order, visible, updated_at, updated_by_email) values (?,?,?,?,?,?,?,?,?,?,?)").run("storm-caja", 1_500_000, 12000, null, null, 0, 0, 2, 1, BIG_MS, "dueno@example.com");
  db.prepare("insert into product_overrides (product_id, price_usd_minor, order_only, stock_quantity, visible, updated_at, updated_by_email) values (?,?,?,?,?,?,?)").run("storm-sobre", null, 1, null, 0, BIG_MS + 1, "dueno@example.com");
  db.prepare("insert into product_audit (id, product_id, sku, field, old_value, new_value, user_id, user_email, created_at) values (?,?,?,?,?,?,?,?,?)").run(40, "storm-caja", "SKU1", "stock_quantity", "null", "0", "u1", "dueno@example.com", BIG_MS);
  db.prepare("insert into media_assets (id, sha256, width, height, bytes, has_alpha, original_name, uploaded_by_email, created_at) values (?,?,?,?,?,?,?,?,?)").run("c732a20d2dfdf184addf47ad.webp", "abc", 800, 600, 1216, 1, "foto.png", "dueno@example.com", BIG_MS);
  db.prepare("insert into admin_settings (key, value, updated_at, updated_by_email) values (?,?,?,?)").run("low_stock_threshold", "5", BIG_MS, "dueno@example.com");
  db.prepare("insert into system_flags (key, applied_at, note) values (?,?,?)").run("stock-inicial-cero-2026-10-14", BIG_MS, "nota");
  db.close();
}

describe("migración desde el SQLite original", () => {
  it("la revisión previa NO escribe nada y cuenta lo que faltaría", async () => {
    const file = path.join(dir, "a.db");
    sembrar(file);
    const pg = await openTestDb();
    const src = await openSourceCopy(file);
    try {
      const plan = await planMigration(pg.$client, src.db);
      const get = (t: string) => plan.find((p) => p.table === t)!;
      expect(get("user")).toMatchObject({ inSource: 2, inTarget: 0, toInsert: 2 });
      expect(get("inquiry_lines")).toMatchObject({ inSource: 2, toInsert: 2 });
      expect(plan.some((p) => p.table === "session")).toBe(false); // sesiones: fuera por defecto
      expect(await pg.select().from(user)).toHaveLength(0); // nada escrito
    } finally { src.cleanup(); }
  });

  it("migra con los tipos correctos (bigint, booleanos, fechas, ids) y verifica fila por fila", async () => {
    const file = path.join(dir, "b.db");
    sembrar(file);
    const before = fs.readFileSync(file);
    const pg = await openTestDb();
    const src = await openSourceCopy(file);
    try {
      const res = await executeMigration(pg.$client, src.db);
      expect(res.inserted).toMatchObject({ user: 2, account: 1, favorites: 1, inquiries: 1, inquiry_lines: 2, product_overrides: 2, product_audit: 1, media_assets: 1, admin_settings: 1, system_flags: 1 });
      expect(res.verification.every((v) => v.ok)).toBe(true);
    } finally { src.cleanup(); }
    expect(fs.readFileSync(file).equals(before)).toBe(true); // el archivo de origen no se tocó

    const [dueno] = await pg.select().from(user).where(eq(user.id, "u1"));
    expect(dueno).toMatchObject({ email: "dueno@example.com", emailVerified: true });
    expect(dueno.createdAt.getTime()).toBe(BIG_MS); // milisegundos → timestamptz sin perder el valor
    const [cli] = await pg.select().from(user).where(eq(user.id, "u2"));
    expect(cli.emailVerified).toBe(false);
    const [inq] = await pg.select().from(inquiries);
    expect(inq).toMatchObject({ id: "TT-AAAAAAAA", subtotalMinor: BIG_MONEY, discountMinor: 300_000_000, fxRate10k: 15_500_000, fxAsOf: BIG_MS, createdAt: BIG_MS, message: "mensaje con «acentos» ñ", contactName: null });
    const lines = await pg.select().from(inquiryLines).orderBy(inquiryLines.id);
    expect(lines.map((l) => l.id)).toEqual([7, 12]); // ids históricos conservados
    expect(lines[0]).toMatchObject({ unitPriceMinor: 1_500_000_000, lineSubtotalMinor: BIG_MONEY, unitPriceUsdMinor: 12000 });
    expect(lines[1]).toMatchObject({ fulfillment: "encargo", unitPriceUsdMinor: null });
    const ov = await pg.select().from(productOverrides).orderBy(productOverrides.productId);
    expect(ov.map((o) => [o.productId, o.visible, o.orderOnly, o.stockQuantity, o.priceMinor])).toEqual([["storm-caja", true, false, 0, 1_500_000], ["storm-sobre", false, true, null, null]]);
    const [media] = await pg.select().from(mediaAssets);
    expect(media.hasAlpha).toBe(true);
    // La secuencia de identidad sigue desde el máximo (12 / 40): el próximo insert no choca.
    await pg.insert(inquiryLines).values({ inquiryId: "TT-AAAAAAAA", productId: "x", sku: "s", title: "t", language: "ja", quantity: 1, unitPriceMinor: 1, lineSubtotalMinor: 1 });
    expect((await pg.select().from(inquiryLines)).map((l) => l.id).sort((a, b) => a - b)).toEqual([7, 12, 13]);
    await pg.insert(productAudit).values({ productId: "p", sku: "s", field: "f", oldValue: "a", newValue: "b", userId: "u1", userEmail: "e", createdAt: 1 });
    expect(Math.max(...(await pg.select().from(productAudit)).map((a) => a.id))).toBe(41);
    expect(await pg.select().from(favorites)).toHaveLength(1);
  });

  it("repetir es seguro: no duplica y NO pisa lo que el administrador cambió después", async () => {
    const file = path.join(dir, "c.db");
    sembrar(file);
    const pg = await openTestDb();
    let src = await openSourceCopy(file);
    try { await executeMigration(pg.$client, src.db); } finally { src.cleanup(); }
    // Cambio posterior del administrador en el destino (precio y configuración) y un usuario nuevo.
    await pg.update(productOverrides).set({ priceUsdMinor: 15500, stockQuantity: 9, updatedAt: BIG_MS + 999 }).where(eq(productOverrides.productId, "storm-caja"));
    await pg.update(adminSettings).set({ value: "8" }).where(eq(adminSettings.key, "low_stock_threshold"));
    await pg.insert(user).values({ id: "u3", name: "Nueva", email: "nueva@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });

    src = await openSourceCopy(file);
    try {
      const plan = await planMigration(pg.$client, src.db);
      expect(plan.reduce((n, p) => n + p.toInsert, 0)).toBe(0);
      expect(plan.find((p) => p.table === "product_overrides")).toMatchObject({ alreadyDifferent: 1, alreadyIdentical: 1 });
      const res = await executeMigration(pg.$client, src.db);
      expect(Object.values(res.inserted).every((n) => n === 0)).toBe(true);
      expect(res.verification.every((v) => v.ok)).toBe(true);
    } finally { src.cleanup(); }
    const [ov] = await pg.select().from(productOverrides).where(eq(productOverrides.productId, "storm-caja"));
    expect(ov).toMatchObject({ priceUsdMinor: 15500, stockQuantity: 9 }); // el cambio del administrador sobrevive
    expect((await pg.select().from(adminSettings))[0].value).toBe("8");
    expect(await pg.select().from(user)).toHaveLength(3);
    expect(await pg.select().from(inquiryLines)).toHaveLength(2);
  });

  it("si algo falla a mitad de camino no queda nada a medias (una sola transacción)", async () => {
    const file = path.join(dir, "d.db");
    sembrar(file);
    // Se corrompe a propósito: una consulta apunta a un usuario inexistente de `inquiry_lines` (clave foránea) para forzar un error en la segunda parte.
    const lite = new Database(file);
    lite.pragma("foreign_keys = OFF");
    lite.prepare("insert into inquiry_lines (id, inquiry_id, product_id, sku, title, language, quantity, fulfillment, unit_price_minor, line_subtotal_minor) values (99,'TT-HUERFANA','p','s','t','ja',1,'stock',1,1)").run();
    lite.close();
    const pg = await openTestDb();
    const src = await openSourceCopy(file);
    try {
      await expect(executeMigration(pg.$client, src.db)).rejects.toThrow();
    } finally { src.cleanup(); }
    expect(await pg.select().from(user)).toHaveLength(0);
    expect(await pg.select().from(inquiries)).toHaveLength(0);
  });

  it("con --incluir-sesiones migra también las sesiones", async () => {
    const file = path.join(dir, "e.db");
    sembrar(file);
    const pg = await openTestDb();
    const src = await openSourceCopy(file);
    try {
      const res = await executeMigration(pg.$client, src.db, true);
      expect(res.inserted.session).toBe(1);
    } finally { src.cleanup(); }
  });

  const real = fs.existsSync(".local/backups/pre-postgres") ? fs.readdirSync(".local/backups/pre-postgres").find((f) => f.endsWith(".db")) : undefined;
  it.skipIf(!real)("ensayo con la copia REAL de la base del dueño (local): migra, verifica y repetir no cambia nada", async () => {
    const file = path.join(".local/backups/pre-postgres", real!);
    const pg = await openTestDb();
    const src = await openSourceCopy(file);
    try {
      const plan = await planMigration(pg.$client, src.db);
      const res = await executeMigration(pg.$client, src.db);
      expect(res.verification.every((v) => v.ok), JSON.stringify(res.verification.filter((v) => !v.ok))).toBe(true);
      expect(plan.every((p) => p.alreadyDifferent === 0)).toBe(true);
      const again = await executeMigration(pg.$client, src.db);
      expect(Object.values(again.inserted).every((n) => n === 0)).toBe(true);
      // Conteos informados (solo números, sin datos).
      console.log("Ensayo con la copia real:", plan.map((p) => `${p.table}=${p.inSource}`).join(", "));
    } finally { src.cleanup(); }
    void postgres;
  });
});

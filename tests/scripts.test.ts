import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./helpers/pg";

// Los scripts de línea de comandos se ejecutan de verdad (no solo sus funciones): así se detectan errores de arranque
// que las pruebas de la librería no ven (p. ej. un script que no corre en CommonJS).
const tsx = path.resolve("node_modules/tsx/dist/cli.mjs");
let dir: string;
const run = (script: string, args: string[] = [], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [tsx, script, ...args], { encoding: "utf8", env: { ...process.env, ...env }, cwd: process.cwd(), timeout: 60_000 });

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "scripts-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("scripts de línea de comandos", () => {
  it("db:migrate (repetible), db:backup y db:restore funcionan de punta a punta sobre PostgreSQL", async () => {
    const src = await openTestDb();
    const dst = await openTestDb();
    const backups = path.join(dir, "backups");
    const envSrc = { DIRECT_URL: src.testUrl, BACKUP_DIR: backups, STORAGE_DRIVER: "local", UPLOADS_DIR: path.join(dir, "uploads") };
    const envDst = { ...envSrc, DIRECT_URL: dst.testUrl };

    expect(run("scripts/db-migrate.ts", [], envSrc).status).toBe(0);
    expect(run("scripts/db-migrate.ts", [], envSrc).status).toBe(0); // repetir no rompe nada

    const b = run("scripts/db-backup.ts", [], envSrc);
    expect(b.status, b.stderr).toBe(0);
    expect(b.stdout).not.toContain(src.testUrl); // nunca se imprime la cadena de conexión
    const copy = fs.readdirSync(backups).find((f) => /^tienda-\d{8}-\d{6}$/.test(f))!;
    expect(copy).toBeTruthy();

    const sin = run("scripts/db-restore.ts", [path.join(backups, copy)], envDst);
    expect(sin.status).toBe(1); // sin --yes no hace nada
    expect(sin.stderr).toContain("--yes");

    const ok = run("scripts/db-restore.ts", [path.join(backups, copy), "--yes"], envDst);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain("Base restaurada y verificada");
    expect(ok.stdout).not.toContain(dst.testUrl);
    expect(fs.readdirSync(backups).some((f) => f.startsWith("pre-restauracion-"))).toBe(true);

    const malo = path.join(dir, "malo");
    fs.mkdirSync(malo);
    fs.writeFileSync(path.join(malo, "manifest.json"), "no es un manifiesto");
    const bad = run("scripts/db-restore.ts", [malo, "--yes"], envDst);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("No se restauró nada");
  });

  it("catalog:check valida el catálogo actual sin errores", () => {
    const r = run("scripts/catalog-check.ts");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain("Sin errores.");
  });

  it("release:check sale con error y lista los bloqueantes mientras la tienda sea una demo", () => {
    const r = run("scripts/release-check.ts", [], { WHATSAPP_NUMBER: "", BETTER_AUTH_SECRET: "", BETTER_AUTH_URL: "" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("BLOQUEANTES para publicar");
    for (const area of ["[Marca]", "[Legal]", "[WhatsApp]", "[Catálogo]", "[Imágenes]", "[Correo]", "[Hosting]"]) expect(r.stdout).toContain(area);
    expect(r.stdout).toContain("NO está lista para vender públicamente");
  });
});

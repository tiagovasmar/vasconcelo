// Verifica respaldo y restauración de punta a punta con los comandos reales (`npm run db:backup` / `npm run db:restore`) sobre BASES DESCARTABLES
// en una carpeta temporal. Nunca toca .local/data/tienda.db ni sus uploads.
//   node scripts/verificar-respaldo.mjs [--desde-copia-de <base>]
// Con --desde-copia-de, la base descartable parte de una COPIA de esa base (solo lectura sobre el original) para comprobar datos reales;
// sin él, se crea una base nueva con las migraciones y datos marcados de prueba.
// Pasos: crear/copiar → registrar huella de todas las tablas → respaldar → alterar la base → restaurar sin --yes (debe negarse) → restaurar
// con --yes → la huella vuelve a ser la de la copia, queda `pre-restauracion-*` con el estado alterado → copia corrupta/ajena rechazada
// sin tocar la base → integridad OK.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const raiz = process.cwd();
const desde = process.argv.includes("--desde-copia-de") ? process.argv[process.argv.indexOf("--desde-copia-de") + 1] : null;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verif-respaldo-"));
const base = path.join(tmp, "descartable.db");
const dir = path.join(tmp, "backups");
const env = { ...process.env, DATABASE_PATH: base, BACKUP_DIR: dir, BETTER_AUTH_SECRET: "descartable-descartable-descartable-0123456789" };
const resultados = [];
const check = (ok, texto) => { resultados.push(`${ok ? "OK  " : "FALLA"} ${texto}`); if (!ok) process.exitCode = 1; };
const npm = (args, opts = {}) => spawnSync("npm", ["run", ...args], { cwd: raiz, env, encoding: "utf8", shell: true, ...opts });

/** Huella de todas las tablas (contenido ordenado): detecta cualquier diferencia de datos, no solo de cantidad. */
function huella(file) {
  const db = new Database(file, { readonly: true });
  try {
    const tablas = db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all().map((t) => t.name);
    const h = crypto.createHash("sha256");
    const filas = {};
    for (const t of tablas) {
      const rows = db.prepare(`select * from "${t}"`).all().map((r) => JSON.stringify(r)).sort();
      filas[t] = rows.length;
      h.update(t + "\n" + rows.join("\n") + "\n");
    }
    return { hash: h.digest("hex"), filas, integridad: db.pragma("integrity_check", { simple: true }) };
  } finally { db.close(); }
}

try {
  if (desde) {
    const src = new Database(path.resolve(desde), { readonly: true });
    await src.backup(base); // copia consistente; el original queda intacto
    src.close();
    const c = new Database(base); c.pragma("journal_mode = delete"); c.close();
    check(true, `base descartable creada como copia de ${desde}`);
  } else {
    const m = npm(["db:migrate"]);
    check(m.status === 0 && fs.existsSync(base), "base descartable creada con las migraciones");
    const db = new Database(base);
    const ins = db.prepare("insert or replace into admin_settings (key, value, updated_at, updated_by_email) values (?, ?, ?, ?)");
    for (let i = 1; i <= 5; i++) ins.run(`prueba-respaldo-${i}`, `valor ${i}`, 1700000000000 + i, "descartable@example.com");
    db.close();
  }
  const antes = huella(base);
  check(antes.integridad === "ok", `integridad de la base descartable: ${antes.integridad}`);

  // 1) respaldo con el comando real
  const b = npm(["db:backup"]);
  const copias = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^tienda-.*\.db$/.test(f)) : [];
  check(b.status === 0 && copias.length === 1 && /Copia creada y verificada/.test(b.stdout), `db:backup crea y verifica una copia (${copias[0] ?? "ninguna"})`);
  const copia = path.join(dir, copias[0]);
  check(huella(copia).hash === antes.hash, "la copia tiene exactamente los mismos datos que la base (huella de todas las tablas)");
  check(!fs.existsSync(copia + "-wal") && !fs.existsSync(copia + "-shm"), "la copia es un solo archivo (sin -wal/-shm)");

  // 2) alterar la base (simula datos nuevos y una pérdida)
  const db2 = new Database(base);
  db2.prepare("insert or replace into admin_settings (key, value, updated_at, updated_by_email) values ('prueba-posterior', 'se pierde al restaurar', 1, 'descartable@example.com')").run();
  db2.prepare("delete from admin_settings where key = 'prueba-respaldo-1'").run();
  db2.close();
  const alterada = huella(base);
  check(alterada.hash !== antes.hash, "la base alterada difiere de la copia");

  // 3) restaurar sin --yes: se niega y no cambia nada
  const sin = npm(["db:restore", "--", copia]);
  check(sin.status !== 0 && huella(base).hash === alterada.hash, "db:restore sin --yes se niega y no modifica la base");

  // 4) copia corrupta y archivo ajeno: rechazados, base intacta
  const corrupta = path.join(tmp, "corrupta.db");
  fs.writeFileSync(corrupta, "esto no es una base sqlite");
  const rc = npm(["db:restore", "--", corrupta, "--yes"]);
  check(rc.status !== 0 && /No se restauró nada/.test(rc.stderr + rc.stdout) && huella(base).hash === alterada.hash, "una copia corrupta se rechaza y la base queda intacta");
  const ajena = path.join(tmp, "ajena.db");
  const aj = new Database(ajena); aj.exec("create table otra_cosa (x)"); aj.close();
  const ra = npm(["db:restore", "--", ajena, "--yes"]);
  check(ra.status !== 0 && huella(base).hash === alterada.hash, "una base de otra aplicación (sin las tablas de la tienda) se rechaza y la base queda intacta");

  // 5) restaurar con --yes
  const ok = npm(["db:restore", "--", copia, "--yes"]);
  check(ok.status === 0 && /Base restaurada y verificada/.test(ok.stdout), "db:restore --yes restaura y verifica");
  const despues = huella(base);
  check(despues.hash === antes.hash, "tras restaurar, los datos son idénticos a los del momento del respaldo");
  check(despues.integridad === "ok", `integridad tras restaurar: ${despues.integridad}`);
  const seg = fs.readdirSync(dir).filter((f) => /^pre-restauracion-/.test(f));
  check(seg.length === 1 && huella(path.join(dir, seg[0])).hash === alterada.hash, "se guardó pre-restauracion-* con el estado anterior a restaurar (se puede volver atrás)");
  const db3 = new Database(base, { readonly: true });
  if (!desde) {
    check(db3.prepare("select count(*) n from admin_settings where key = 'prueba-posterior'").get().n === 0 && db3.prepare("select count(*) n from admin_settings where key = 'prueba-respaldo-1'").get().n === 1, "lo posterior al respaldo desapareció y lo borrado volvió");
  }
  db3.close();
  check(Object.keys(antes.filas).length === Object.keys(despues.filas).length && Object.entries(antes.filas).every(([t, n]) => despues.filas[t] === n), `misma cantidad de filas en las ${Object.keys(antes.filas).length} tablas`);

  // 6) volver atrás con la copia de seguridad previa
  const vuelta = npm(["db:restore", "--", path.join(dir, seg[0]), "--yes"]);
  check(vuelta.status === 0 && huella(base).hash === alterada.hash, "se puede volver atrás restaurando pre-restauracion-*");
  console.log(`Filas por tabla (base de la prueba): ${JSON.stringify(antes.filas)}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(resultados.join("\n"));

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Vista previa LOCAL y AISLADA de la promoción caja + sobres, los accesorios y las recomendaciones del carrito. No toca ninguna base real:
 *  - levanta un PostgreSQL descartable propio (puerto PREVIEW_PG_PORT, 54501), migrado con el esquema actual;
 *  - usa el catálogo de PRUEBA (productos ficticios con precio y stock de ejemplo), NO el catálogo real ni sus datos;
 *  - crea una cuenta de dueño local (correo ficticio, confirmado) y datos de ejemplo claramente falsos;
 *  - deja la contraseña de esa cuenta SOLO en `.local/preview-combo-acceso.txt` (carpeta ignorada por Git);
 *  - arranca la tienda en http://localhost:3211 con variables propias (las de `.env.local` quedan anuladas).
 * Ctrl+C lo detiene y borra todos los datos de la vista previa.
 *
 *   SKIP_ENV_FILES=1 npx tsx --conditions=react-server scripts/preview-combo.ts
 */
const PORT = Number(process.env.PREVIEW_PORT || 3211);
const PG_PORT = Number(process.env.PREVIEW_PG_PORT || 54501);
const OWNER_EMAIL = "dueno-local@example.com";

async function main() {
  // El catálogo de prueba se elige antes de importar nada que lo use.
  process.env.CATALOG_FIXTURE = "demo";
  process.env.FX_AUTO_REFRESH = "0";
  process.env.STORAGE_DRIVER = "local";

  const { startTestPostgres, createDatabaseFromTemplate } = await import("./lib/test-postgres");
  const { createDb } = await import("../src/db/client");
  const { account, user } = await import("../src/db/schema");
  const { hashPassword } = await import("better-auth/crypto");

  const pg = await startTestPostgres({ port: PG_PORT });
  await createDatabaseFromTemplate(pg.adminUrl, "preview_combo");
  const url = pg.urlFor("preview_combo");
  const db = createDb(url, { max: 4 });

  // --- cuenta del dueño local ---
  const password = randomBytes(9).toString("base64url");
  const now = new Date();
  const ownerId = randomBytes(16).toString("hex");
  await db.insert(user).values({ id: ownerId, name: "Dueño (vista previa)", email: OWNER_EMAIL, emailVerified: true, createdAt: now, updatedAt: now });
  await db.insert(account).values({ id: randomBytes(16).toString("hex"), accountId: ownerId, providerId: "credential", userId: ownerId, password: await hashPassword(password), createdAt: now, updatedAt: now });
  const accessFile = path.resolve(".local/preview-combo-acceso.txt");
  fs.mkdirSync(path.dirname(accessFile), { recursive: true });
  fs.writeFileSync(accessFile, `Vista previa LOCAL de la promoción caja + sobres y accesorios (datos y catálogo de PRUEBA, base descartable)\nURL: http://localhost:${PORT}/cuenta/ingresar\nCorreo: ${OWNER_EMAIL}\nContraseña: ${password}\n`);

  // --- promoción de EJEMPLO (solo en esta base descartable; en la tienda real la selección la define el dueño) ---
  const { saveComboConfig } = await import("../src/features/promos/settings");
  await saveComboConfig(db, { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre", "parcial-sobre"], expectedVersion: 0 }, { id: ownerId, email: OWNER_EMAIL });
  await db.$client.end({ timeout: 5 });

  // --- la tienda, con variables propias (anulan las de .env.local) ---
  const env = {
    ...process.env,
    DATABASE_URL: url, DIRECT_URL: "", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_STORAGE_BUCKET: "",
    ADMIN_EMAIL: OWNER_EMAIL, CATALOG_FIXTURE: "demo", FX_AUTO_REFRESH: "0", STORAGE_DRIVER: "local", UPLOADS_DIR: path.resolve(".local/preview-combo-uploads"),
    MAIL_TRANSPORT: "local", MAIL_DIR: path.resolve(".local/preview-combo-mail"), WHATSAPP_NUMBER: "", NEXT_DIST_DIR: ".next-preview-combo", SKIP_ENV_FILES: "1",
    BETTER_AUTH_URL: `http://localhost:${PORT}`, BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_SECRET_FILE: path.resolve(".local/preview-combo.secret"),
  };
  console.log(`\nVista previa lista: http://localhost:${PORT}/admin/consultas\nAcceso: ver ${accessFile}\n(catálogo de PRUEBA y base descartable; Ctrl+C la borra)\n`);
  const next = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", String(PORT)], { env, stdio: "inherit", shell: process.platform === "win32" });
  const stop = async () => {
    next.kill();
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  next.on("exit", stop);
}
main().catch((e) => { console.error(e); process.exit(1); });

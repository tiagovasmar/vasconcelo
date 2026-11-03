import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { startTestPostgres, createDatabaseFromTemplate } from "./lib/test-postgres";

/** Vista previa nueva en cada ejecución. No lee credenciales ni reutiliza 54400/54401. */
async function main() {
  const port = Number(process.env.PREVIEW_PEDIDOS_PORT || 3010);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Puerto de vista previa inválido.");
  const suffix = port === 3010 ? "continuidad" : String(port);
  const dir = path.resolve(`.local/preview-pedidos-${suffix}`);
  fs.mkdirSync(dir, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Next sí lee .env.local: anular TODAS sus claves sin imprimir ni cargar sus valores.
  for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    if (fs.existsSync(file)) for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
      if (key) env[key] = "";
    }
  }
  process.env.TEST_DATABASE_URL = "";
  const pg = await startTestPostgres();
  await createDatabaseFromTemplate(pg.adminUrl, "preview_pedidos");
  Object.assign(env, {
    CIRCLE_NODE_TOTAL: "3", SKIP_ENV_FILES: "1", TEST_DATABASE_URL: "", ENTORNO_LOCAL: "1", ENTORNO_DESCARTABLE: "1",
    DATABASE_URL: pg.urlFor("preview_pedidos"), DIRECT_URL: pg.urlFor("preview_pedidos"),
    ADMIN_EMAIL: "dueno.preview@example.com", BETTER_AUTH_URL: `http://localhost:${port}`,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    STORAGE_DRIVER: "local", MAIL_TRANSPORT: "local", FX_AUTO_REFRESH: "0", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
    SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", MAIL_PROVIDER: "", MAIL_API_KEY: "", MAIL_FROM: "",
    MAIL_DIR: path.join(dir, "mail"), RECEIPTS_DIR: path.join(dir, "receipts"), UPLOADS_DIR: path.join(dir, "uploads"),
    DEV_PEDIDOS_PASSWORD_FILE: path.join(dir, "clientes.txt"), DEV_ADMIN_PASSWORD_FILE: path.join(dir, "admin.txt"),
    NEXT_DIST_DIR: `.next-preview-pedidos-${suffix}`, WHATSAPP_NUMBER: "", CATALOG_FIXTURE: "",
  });
  fs.writeFileSync(path.join(dir, "acceso.txt"), `Vista previa FICTICIA: http://localhost:${port}\nCliente: ana.prueba@example.com\nMayorista aprobada: marta.prueba@example.com\nContraseña clientes: clientes.txt\nAdministrador: ${env.ADMIN_EMAIL}\nContraseña admin: admin.txt\nBase nueva descartable; ninguna condición es comercial real.\n`);
  const run = (args: string[]) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Proceso local terminó con código ${code}`)));
  });
  try {
    await run(["node_modules/tsx/dist/cli.mjs", "scripts/dev-admin.ts"]);
    await run(["node_modules/tsx/dist/cli.mjs", "--conditions=react-server", "scripts/dev-pedidos.ts"]);
    await run(["node_modules/next/dist/bin/next", "build"]);
    console.log(`Vista previa FICTICIA: http://localhost:${port}. Accesos solo en ${path.join(dir, "acceso.txt")}`);
    await run(["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)]);
  } finally { await pg.stop(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

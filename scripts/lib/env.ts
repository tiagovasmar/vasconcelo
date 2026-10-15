import fs from "node:fs";
import { createDb } from "../../src/db/client";

/** Carga `.env.local` y `.env` (si existen) sin pisar variables ya definidas. Los archivos .env* están ignorados por Git: ahí van las credenciales locales. */
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) {
    try {
      process.loadEnvFile(f);
    } catch {
      /* archivo ilegible: se ignora */
    }
  }
}

/** Cadena de conexión para scripts: DIRECT_URL (conexión directa o pooler en modo sesión) y, si no, DATABASE_URL. */
export function scriptUrl(): string {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!url) {
    console.error("Falta DIRECT_URL o DATABASE_URL (en .env.local o en el entorno). Ver docs/DESPLIEGUE-NETLIFY-SUPABASE.md.");
    process.exit(1);
  }
  return url;
}

/** Descripción SEGURA del destino (sin usuario ni contraseña): servidor, puerto y base. */
export function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(cadena de conexión no válida)";
  }
}

export const isLocalTarget = (url: string): boolean => {
  try {
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

export function scriptDb() {
  return createDb(scriptUrl(), { max: 1 });
}

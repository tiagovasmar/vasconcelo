import fs from "node:fs";
import path from "node:path";

/**
 * Almacén de las fotos subidas desde el panel.
 *
 * - **Producción: Supabase Storage** (bucket público de solo lectura; las ESCRITURAS se hacen únicamente desde el servidor con la clave
 *   secreta, que nunca llega al navegador ni lleva el prefijo NEXT_PUBLIC_). Se usa la API REST de Storage directamente (sin SDK).
 * - **Desarrollo y pruebas: carpeta local** (`UPLOADS_DIR`), solo cuando no hay Supabase configurado Y no es un build de producción, o cuando se
 *   pide de forma explícita con `STORAGE_DRIVER=local` (pruebas de recorrido sobre un build de producción en la propia computadora).
 *   En Netlify el disco es efímero y de solo lectura: nunca se usa como reemplazo de Storage (si falta la configuración, subir falla con un error claro).
 */
export interface ImageStore {
  readonly driver: "supabase" | "local";
  /** Guarda el archivo. `created: false` si ya existía (los nombres son hashes del contenido: el archivo existente es idéntico). */
  put(name: string, data: Buffer, contentType: string): Promise<{ created: boolean }>;
  get(name: string): Promise<Buffer | null>;
  exists(name: string): Promise<boolean>;
  list(): Promise<string[]>;
}

export class StorageError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const DEFAULT_BUCKET = "product-images";

export type SupabaseStorageConfig = { url: string; key: string; bucket: string };

/** Configuración de Supabase Storage (null = no configurado). La clave es la «secret key» (o la «service_role» clásica): SOLO servidor. */
export function supabaseStorageConfig(): SupabaseStorageConfig | null {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key, bucket: (process.env.SUPABASE_STORAGE_BUCKET ?? "").trim() || DEFAULT_BUCKET };
}

const localDir = (): string => path.resolve(/*turbopackIgnore: true*/ process.env.UPLOADS_DIR?.trim() || ".local/data/uploads");

function authHeaders(key: string): Record<string, string> {
  // Las claves nuevas (sb_secret_…) NO son JWT: van solo en `apikey`. Las clásicas (service_role) son JWT y también se aceptan como Bearer.
  return key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

export class SupabaseStore implements ImageStore {
  readonly driver = "supabase" as const;
  constructor(private cfg: SupabaseStorageConfig, private fetchFn: typeof fetch = fetch) {}

  private object(name: string) {
    return `${this.cfg.url}/storage/v1/object/${encodeURIComponent(this.cfg.bucket)}/${encodeURIComponent(name)}`;
  }
  private publicObject(name: string) {
    return `${this.cfg.url}/storage/v1/object/public/${encodeURIComponent(this.cfg.bucket)}/${encodeURIComponent(name)}`;
  }

  async put(name: string, data: Buffer, contentType: string): Promise<{ created: boolean }> {
    const res = await this.fetchFn(this.object(name), {
      method: "POST",
      headers: { ...authHeaders(this.cfg.key), "Content-Type": contentType, "x-upsert": "false", "Cache-Control": "max-age=31536000" },
      body: new Uint8Array(data),
    });
    if (res.ok) return { created: true };
    const body = (await res.json().catch(() => ({}))) as { statusCode?: string | number; error?: string; message?: string };
    // Supabase responde 400 con statusCode 409 / error «Duplicate» cuando el objeto ya existe.
    if (res.status === 409 || String(body.statusCode) === "409" || body.error === "Duplicate") return { created: false };
    // No se vuelca el cuerpo completo (podría incluir detalles internos): solo el código y un mensaje corto.
    throw new StorageError(502, "storage_error", `Supabase Storage rechazó la subida (HTTP ${res.status}${body.message ? `: ${String(body.message).slice(0, 120)}` : ""}).`);
  }

  async get(name: string): Promise<Buffer | null> {
    const res = await this.fetchFn(this.publicObject(name));
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new StorageError(502, "storage_error", `Supabase Storage no pudo entregar el archivo (HTTP ${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }

  async exists(name: string): Promise<boolean> {
    const res = await this.fetchFn(this.publicObject(name), { method: "HEAD" });
    return res.ok;
  }

  async list(): Promise<string[]> {
    const names: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const res = await this.fetchFn(`${this.cfg.url}/storage/v1/object/list/${encodeURIComponent(this.cfg.bucket)}`, {
        method: "POST",
        headers: { ...authHeaders(this.cfg.key), "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "", limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!res.ok) throw new StorageError(502, "storage_error", `Supabase Storage no pudo listar el bucket (HTTP ${res.status}).`);
      const page = (await res.json()) as Array<{ name: string; id: string | null }>;
      names.push(...page.filter((o) => o.id !== null).map((o) => o.name));
      if (page.length < 1000) return names;
    }
  }
}

export class LocalStore implements ImageStore {
  readonly driver = "local" as const;
  async put(name: string, data: Buffer): Promise<{ created: boolean }> {
    const dir = localDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return { created: false };
    // Se escribe a un temporal y se renombra: un corte no deja un archivo a medias bajo el nombre final.
    const tmp = path.join(dir, `.${name}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
    return { created: true };
  }
  async get(name: string): Promise<Buffer | null> {
    try {
      return fs.readFileSync(path.join(localDir(), name));
    } catch {
      return null;
    }
  }
  async exists(name: string): Promise<boolean> {
    return fs.existsSync(path.join(localDir(), name));
  }
  async list(): Promise<string[]> {
    try {
      return fs.readdirSync(localDir()).filter((f) => !f.startsWith("."));
    } catch {
      return [];
    }
  }
}

/** ¿Se permite el almacén en disco? (nunca en un build de producción salvo pedido explícito para pruebas locales). */
export const localStorageAllowed = (): boolean => process.env.STORAGE_DRIVER === "local" || process.env.NODE_ENV !== "production";

/** Almacén activo según el entorno. Lanza `StorageError` si no hay ninguno utilizable. */
export function getStore(): ImageStore {
  if (process.env.STORAGE_DRIVER !== "local") {
    const cfg = supabaseStorageConfig();
    if (cfg) return new SupabaseStore(cfg);
  }
  if (localStorageAllowed()) return new LocalStore();
  throw new StorageError(503, "storage_not_configured", "El almacenamiento de fotos no está configurado (faltan SUPABASE_URL y SUPABASE_SECRET_KEY).");
}

/** ¿Hay un almacén de fotos utilizable? (el panel avisa en vez de fallar al subir). */
export function storageAvailable(): boolean {
  try {
    getStore();
    return true;
  } catch {
    return false;
  }
}

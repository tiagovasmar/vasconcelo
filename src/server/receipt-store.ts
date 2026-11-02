import fs from "node:fs";
import path from "node:path";
import { StorageError, supabaseStorageConfig, type SupabaseStorageConfig } from "./storage";

/**
 * Almacén PRIVADO de comprobantes de transferencia. Es independiente del almacén de fotos de productos (que es un bucket PÚBLICO de solo lectura):
 *  - Producción: un bucket PRIVADO de Supabase Storage (`SUPABASE_RECEIPTS_BUCKET`, por defecto `payment-receipts`). Las lecturas y escrituras usan SIEMPRE la
 *    clave secreta del servidor por la ruta autenticada de la API (nunca `/object/public/…`) y los archivos solo salen por `/api/comprobantes/[id]`, que valida quién pregunta.
 *  - Desarrollo y pruebas: carpeta local (`RECEIPTS_DIR`), fuera de `public/`. Nunca se usa en producción salvo `STORAGE_DRIVER=local` (pruebas locales sobre un build).
 * Si el bucket privado no está configurado en producción, subir un comprobante falla con un mensaje claro: jamás se cae al bucket público.
 */
export interface ReceiptStore {
  readonly driver: "supabase" | "local";
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

export const DEFAULT_RECEIPTS_BUCKET = "payment-receipts";

export function receiptsBucket(): string {
  return (process.env.SUPABASE_RECEIPTS_BUCKET ?? "").trim() || DEFAULT_RECEIPTS_BUCKET;
}

const authHeaders = (key: string): Record<string, string> => (key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key });

export class SupabasePrivateReceiptStore implements ReceiptStore {
  readonly driver = "supabase" as const;
  constructor(private cfg: SupabaseStorageConfig, private fetchFn: typeof fetch = fetch) {
    // Protección contra una configuración peligrosa: el bucket de comprobantes jamás puede ser el de las fotos públicas.
    if (cfg.bucket === (process.env.SUPABASE_STORAGE_BUCKET ?? "").trim() || cfg.bucket === "product-images") throw new StorageError(503, "storage_not_configured", "El bucket de comprobantes no puede ser el de las fotos de productos (es público).");
  }
  private url(key: string) {
    return `${this.cfg.url}/storage/v1/object/${encodeURIComponent(this.cfg.bucket)}/${encodeURIComponent(key)}`;
  }
  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const res = await this.fetchFn(this.url(key), { method: "POST", headers: { ...authHeaders(this.cfg.key), "Content-Type": contentType, "x-upsert": "false", "Cache-Control": "private, max-age=0" }, body: new Uint8Array(data) });
    if (!res.ok) throw new StorageError(502, "storage_error", `El almacenamiento privado rechazó la subida (HTTP ${res.status}).`);
  }
  async get(key: string): Promise<Buffer | null> {
    const res = await this.fetchFn(this.url(key), { headers: authHeaders(this.cfg.key) });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new StorageError(502, "storage_error", `El almacenamiento privado no pudo entregar el archivo (HTTP ${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }
  async remove(key: string): Promise<void> {
    await this.fetchFn(this.url(key), { method: "DELETE", headers: authHeaders(this.cfg.key) });
  }
}

const localDir = (): string => path.resolve(/*turbopackIgnore: true*/ process.env.RECEIPTS_DIR?.trim() || ".local/data/receipts");

export class LocalReceiptStore implements ReceiptStore {
  readonly driver = "local" as const;
  async put(key: string, data: Buffer): Promise<void> {
    const dir = localDir();
    fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    const tmp = path.join(dir, `.${key}.${process.pid}.tmp`);
    fs.writeFileSync(/*turbopackIgnore: true*/ tmp, data, { mode: 0o600 });
    fs.renameSync(/*turbopackIgnore: true*/ tmp, path.join(dir, key));
  }
  async get(key: string): Promise<Buffer | null> {
    try {
      return fs.readFileSync(/*turbopackIgnore: true*/ path.join(localDir(), path.basename(key)));
    } catch {
      return null;
    }
  }
  async remove(key: string): Promise<void> {
    try {
      fs.unlinkSync(/*turbopackIgnore: true*/ path.join(localDir(), path.basename(key)));
    } catch {
      /* ya no estaba */
    }
  }
}

export function getReceiptStore(): ReceiptStore {
  if (process.env.STORAGE_DRIVER !== "local") {
    const base = supabaseStorageConfig();
    if (base) return new SupabasePrivateReceiptStore({ ...base, bucket: receiptsBucket() });
  }
  if (process.env.STORAGE_DRIVER === "local" || process.env.NODE_ENV !== "production") return new LocalReceiptStore();
  throw new StorageError(503, "storage_not_configured", "El almacenamiento privado de comprobantes no está configurado (faltan SUPABASE_URL, SUPABASE_SECRET_KEY y un bucket privado).");
}

export function receiptStorageAvailable(): boolean {
  try {
    getReceiptStore();
    return true;
  } catch {
    return false;
  }
}

import "server-only";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp, { type Metadata, type OutputInfo } from "sharp";
import type { Db } from "@/db/client";
import { mediaAssets } from "@/db/schema";
import { getStore } from "./storage";

/**
 * Imágenes subidas desde el panel. Se guardan en Supabase Storage (ver `storage.ts`; en desarrollo, una carpeta local) y se sirven por
 * `/images/uploads/<nombre>` (ver la ruta), así las referencias guardadas en la base no cambian. Nada depende de Downloads ni de una ruta del equipo.
 *
 * Seguridad: el archivo se identifica por su CONTENIDO (no por la extensión ni el tipo que declara el navegador), se decodifica y se
 * RE-CODIFICA con sharp a WebP (se descartan metadatos y cualquier carga adicional), y el nombre final lo genera el servidor
 * (hash del resultado): el nombre original nunca se usa como ruta. Un archivo subido jamás se ejecuta ni se interpreta como código.
 */
/** 5 MB: las funciones de Netlify aceptan cuerpos de pedido de hasta ~6 MB, así que se deja margen para el formulario multipart. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MIN_SIDE = 300;
export const MAX_SIDE = 12_000;
export const MAX_PIXELS = 60_000_000;
const FULL_MAX = 1600;
const THUMB_MAX = 400;
const ALLOWED = new Set(["jpeg", "png", "webp"]);
export const UPLOAD_NAME = /^[a-f0-9]{24}(-t)?\.webp$/;

export class MediaError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Formato real por firma de bytes (independiente de la extensión). */
export function sniffFormat(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

export type StoredImage = { id: string; src: string; thumbSrc: string; width: number; height: number; bytes: number; hasAlpha: boolean; duplicate: boolean };

export const srcOf = (id: string) => `/images/uploads/${id}`;

/** Valida, optimiza y guarda una imagen subida. Lanza MediaError con un mensaje claro si no es válida. */
export async function storeUpload(db: Db, input: { data: Buffer; originalName?: string | null; uploadedByEmail: string; now?: number }): Promise<StoredImage> {
  const { data } = input;
  if (data.length === 0) throw new MediaError(400, "empty_file", "El archivo está vacío.");
  if (data.length > MAX_UPLOAD_BYTES) throw new MediaError(413, "too_large", `La imagen pesa más de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Reducila antes de subirla.`);
  const sniffed = sniffFormat(data);
  if (!sniffed) throw new MediaError(415, "unsupported_type", "El archivo no es una imagen JPG, PNG o WebP válida (se revisa el contenido real, no la extensión).");

  let meta: Metadata;
  try {
    meta = await sharp(data, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
  } catch {
    throw new MediaError(422, "corrupt_image", "No se pudo leer la imagen: el archivo parece dañado.");
  }
  if (!meta.format || !ALLOWED.has(meta.format) || meta.format !== sniffed) throw new MediaError(415, "unsupported_type", "El archivo no es una imagen JPG, PNG o WebP válida.");
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new MediaError(422, "corrupt_image", "No se pudieron leer las dimensiones de la imagen.");
  // Las dimensiones de una imagen rotada por EXIF se evalúan ya orientadas.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap ? h : w;
  const height = swap ? w : h;
  if (Math.min(width, height) < MIN_SIDE) throw new MediaError(422, "too_small", `La imagen es muy chica (${width}×${height}). Debe medir al menos ${MIN_SIDE} px de lado.`);
  if (Math.max(width, height) > MAX_SIDE) throw new MediaError(422, "too_large_dimensions", `La imagen es enorme (${width}×${height}). El máximo es ${MAX_SIDE} px de lado.`);

  let full: { data: Buffer; info: OutputInfo };
  let thumb: Buffer;
  try {
    const base = () => sharp(data, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate();
    full = await base().resize({ width: FULL_MAX, height: FULL_MAX, fit: "inside", withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 100, effort: 4 }).toBuffer({ resolveWithObject: true });
    thumb = await base().resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true }).webp({ quality: 80, alphaQuality: 90, effort: 4 }).toBuffer();
  } catch {
    throw new MediaError(422, "corrupt_image", "No se pudo procesar la imagen: el archivo parece dañado.");
  }
  const sha = createHash("sha256").update(full.data).digest("hex");
  const stem = sha.slice(0, 24);
  const id = `${stem}.webp`;
  const store = getStore();
  // Primero el archivo y su miniatura; recién después el registro en la base (un archivo suelto con nombre-hash es inofensivo y se reconcilia al volver a subirlo).
  const [fullPut, thumbPut] = [await store.put(id, full.data, "image/webp"), await store.put(`${stem}-t.webp`, thumb, "image/webp")];
  const duplicate = !fullPut.created && !thumbPut.created;
  await db.insert(mediaAssets)
    .values({ id, sha256: sha, width: full.info.width, height: full.info.height, bytes: full.data.length, hasAlpha: Boolean(full.info.channels === 4), originalName: input.originalName ? path.basename(input.originalName).slice(0, 120) : null, uploadedByEmail: input.uploadedByEmail, createdAt: input.now ?? Date.now() })
    .onConflictDoNothing();
  return { id, src: srcOf(id), thumbSrc: srcOf(`${stem}-t.webp`), width: full.info.width, height: full.info.height, bytes: full.data.length, hasAlpha: full.info.channels === 4, duplicate };
}

/** Lee un archivo subido por su nombre (solo nombres generados por el servidor). null si el nombre no es válido o no existe. */
export async function readUpload(name: string): Promise<Buffer | null> {
  if (!UPLOAD_NAME.test(name)) return null;
  return getStore().get(name);
}

export const uploadExists = async (src: string): Promise<boolean> => {
  const name = src.startsWith("/images/uploads/") ? src.slice("/images/uploads/".length) : "";
  return UPLOAD_NAME.test(name) && getStore().exists(name);
};

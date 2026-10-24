/**
 * Validación de la entrega y del nombre SIN dependencias: la usa el navegador (pedido) para adelantar los mensajes sin cargar `zod` (≈ 31 KB comprimidos que
 * antes viajaban solo para esto). El servidor sigue validando con `DeliverySchema` (zod, en schemas.ts), que se arma con estas mismas constantes; una prueba compara
 * ambas validaciones con muchos casos para que no se separen. La validación de verdad es siempre la del servidor.
 */

/** Jurisdicciones argentinas para Andreani. */
export const provinces = [
  "Ciudad Autónoma de Buenos Aires", "Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos",
  "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis",
  "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
] as const;

/** Código postal argentino: 4 dígitos (CP viejo) o CPA (letra + 4 dígitos + 3 letras). */
export const postalCodeRegex = /^([A-Za-z]\d{4}[A-Za-z]{3}|\d{4})$/;
export const POSTAL_MESSAGE = "Código postal inválido (ej.: 1704 o B1704ABC)";
export const PROVINCE_MESSAGE = "Provincia: elegí una opción";

/**
 * «Nombre y apellido»: obligatorio en todos los pedidos (también el retiro). Se exigen al menos dos palabras y solo letras, espacios, apóstrofes, puntos y guiones.
 * Es la única validación de verdad: la del navegador solo adelanta el mensaje.
 */
export const CONTACT_NAME_MESSAGE = "Escribí tu nombre y apellido.";
export const normalizeName = (v: string) => v.replace(/\s+/g, " ").trim();
export const isFullName = (v: string) => {
  const n = normalizeName(v);
  return n.length >= 3 && n.length <= 60 && n.split(" ").length >= 2 && /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u.test(n);
};

export type Delivery =
  | { method: "andreani"; locality: string; province: (typeof provinces)[number]; postalCode: string }
  | { method: "moto"; locality: string; postalCode: string }
  | { method: "retiro" };

export type DeliveryResult = { success: true; data: Delivery } | { success: false; error: { issues: Array<{ path: [string]; message: string }> } };

const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : null);

/** Misma regla que `DeliverySchema`: mismos campos, mismos mensajes y el mismo orden de avisos (localidad, provincia, código postal). */
export function validateDelivery(input: unknown): DeliveryResult {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const issues: Array<{ path: [string]; message: string }> = [];
  const locality = () => {
    const v = trimmed(o.locality);
    if (v === null || v.length < 2) issues.push({ path: ["locality"], message: "Localidad: obligatorio" });
    else if (v.length > 80) issues.push({ path: ["locality"], message: "Localidad: demasiado largo" });
    return v ?? "";
  };
  const postal = () => {
    const v = trimmed(o.postalCode);
    if (v === null) issues.push({ path: ["postalCode"], message: "Código postal: obligatorio" });
    else if (!postalCodeRegex.test(v)) issues.push({ path: ["postalCode"], message: POSTAL_MESSAGE });
    return v ?? "";
  };
  if (o.method === "retiro") return { success: true, data: { method: "retiro" } };
  if (o.method === "andreani") {
    const l = locality();
    const province = (provinces as readonly string[]).includes(o.province as string) ? (o.province as (typeof provinces)[number]) : null;
    if (!province) issues.push({ path: ["province"], message: PROVINCE_MESSAGE });
    const p = postal();
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { method: "andreani", locality: l, province: province!, postalCode: p } };
  }
  if (o.method === "moto") {
    const l = locality();
    const p = postal();
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { method: "moto", locality: l, postalCode: p } };
  }
  return { success: false, error: { issues: [{ path: ["method"], message: "Elegí cómo querés recibirlo." }] } };
}

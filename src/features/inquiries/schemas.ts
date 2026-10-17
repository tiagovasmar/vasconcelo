import { z } from "zod";
import { paymentMethods } from "@/content/checkout-options";

/** Jurisdicciones argentinas para Andreani. */
export const provinces = [
  "Ciudad Autónoma de Buenos Aires", "Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos",
  "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis",
  "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
] as const;

/** Código postal argentino: 4 dígitos (CP viejo) o CPA (letra + 4 dígitos + 3 letras). */
export const postalCodeRegex = /^([A-Za-z]\d{4}[A-Za-z]{3}|\d{4})$/;

const text = (label: string, min = 2, max = 80) =>
  z.string({ error: `${label}: obligatorio` }).trim().min(min, `${label}: obligatorio`).max(max, `${label}: demasiado largo`);
const postal = z.string({ error: "Código postal: obligatorio" }).trim().regex(postalCodeRegex, "Código postal inválido (ej.: 1704 o B1704ABC)");

export const DeliverySchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("andreani"), locality: text("Localidad"), province: z.enum(provinces, { error: "Provincia: elegí una opción" }), postalCode: postal }),
  z.object({ method: z.literal("moto"), locality: text("Localidad"), postalCode: postal }),
  // Un único punto de retiro: no hay nada que elegir. Cualquier `pickupPoint` viejo que mande un carrito antiguo se ignora.
  z.object({ method: z.literal("retiro") }),
]);
export type Delivery = z.infer<typeof DeliverySchema>;

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
const ContactNameSchema = z
  .string({ error: CONTACT_NAME_MESSAGE })
  .transform(normalizeName)
  .refine((v) => v.length > 0, CONTACT_NAME_MESSAGE)
  .refine((v) => v.length <= 60, "Nombre y apellido: demasiado largo (máximo 60).")
  .refine((v) => v.length === 0 || v.length > 60 || isFullName(v), "Escribí tu nombre y apellido (solo letras).");

const paymentIds = paymentMethods.map((p) => p.id) as [string, ...string[]];

export const CartItemSchema = z.object({
  productId: z.string().min(1).max(80),
  quantity: z.number().int("La cantidad debe ser un número entero").min(1, "La cantidad mínima es 1").max(99),
  /** Precio (centavos) que el cliente vio; solo sirve para avisar cambios. Nunca se usa para calcular. */
  expectedPriceMinor: z.number().int().nonnegative().optional(),
  /** buy = compra de lo disponible (con precio del catálogo) · encargo = consulta por encargo (sin precio ni cotización; no reserva nada). Sin dato = buy. */
  mode: z.enum(["buy", "encargo"]).optional(),
});
export type CartItemInput = z.infer<typeof CartItemSchema>;

export const ValidateRequestSchema = z.object({ items: z.array(CartItemSchema).max(30) });

export const CreateInquirySchema = z.object({
  items: z.array(CartItemSchema).min(1, "El carrito está vacío").max(30),
  delivery: DeliverySchema,
  payment: z.enum(paymentIds, { error: "Elegí un método de pago disponible." }),
  contactName: ContactNameSchema,
  /** Teléfono opcional para que la tienda pueda responder: dígitos, espacios, +, guiones y paréntesis (6 a 20 caracteres). */
  contactPhone: z.string().trim().max(20, "Teléfono: demasiado largo").optional().transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || (/^[0-9+()\-\s]+$/.test(v) && v.replace(/\D/g, "").length >= 6), "Teléfono: usá solo números, espacios, + y guiones (mínimo 6 dígitos)"),
  idempotencyKey: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/),
  acceptPriceChanges: z.boolean().optional(),
});
export type CreateInquiryInput = z.infer<typeof CreateInquirySchema>;

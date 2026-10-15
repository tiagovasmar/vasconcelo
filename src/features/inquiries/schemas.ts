import { z } from "zod";
import { paymentMethods, pickupPoints } from "@/content/checkout-options";

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
  z.object({ method: z.literal("retiro"), pickupPoint: z.enum(pickupPoints.map((p) => p.id) as [string, ...string[]], { error: "Punto de retiro: elegí Ramos Mejía o Haedo" }) }),
]);
export type Delivery = z.infer<typeof DeliverySchema>;

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
  payment: z.enum(paymentIds, { error: "Preferencia de pago no habilitada" }),
  contactName: z.string().trim().max(60, "Nombre: demasiado largo").optional().transform((v) => (v ? v : undefined)),
  idempotencyKey: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/),
  acceptPriceChanges: z.boolean().optional(),
});
export type CreateInquiryInput = z.infer<typeof CreateInquirySchema>;

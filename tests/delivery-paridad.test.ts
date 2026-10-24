import { describe, expect, it } from "vitest";
import { DeliverySchema } from "@/features/inquiries/schemas";
import { postalCodeRegex, provinces, validateDelivery } from "@/features/inquiries/delivery";

/**
 * El pedido del navegador valida la entrega con `validateDelivery` (sin zod, para no mandar ≈ 31 KB comprimidos de más); el servidor con `DeliverySchema`.
 * Esta prueba las compara con muchos casos: mismo resultado, mismos datos normalizados y el mismo primer aviso por campo.
 */
const first = (issues: Array<{ path: PropertyKey[]; message: string }>) => {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] ??= i.message;
  return out;
};
const localities = ["", " ", "A", "Ab", "  Lomas de Zamora  ", "x".repeat(80), "x".repeat(81), "  " + "y".repeat(80) + "  ", undefined, null, 5];
const postals = ["", "1704", " 1704 ", "B1704ABC", "b1704abc", "17044", "ABCD", "12 34", "B1704AB", undefined, null, 1704];
const provs: unknown[] = ["", "Salta", "Atlantida", ...provinces, undefined, 3];
const methods: unknown[] = ["andreani", "moto", "retiro", "", "otro", undefined];

describe("validación de la entrega: navegador (sin zod) = servidor (zod)", () => {
  it("coinciden en todos los casos combinados", () => {
    let casos = 0;
    for (const method of methods) for (const locality of localities) for (const postalCode of postals) for (const province of provs) {
      const input = { method, locality, postalCode, province };
      const z = DeliverySchema.safeParse(input);
      const v = validateDelivery(input);
      expect(v.success, JSON.stringify(input)).toBe(z.success);
      if (z.success && v.success) expect(v.data).toEqual(z.data);
      if (!z.success && !v.success) {
        // Mismo primer aviso por campo (el pedido muestra uno por campo); el aviso de «método» solo existe en el servidor para un método inválido.
        if (method === "andreani" || method === "moto") expect(first(v.error.issues), JSON.stringify(input)).toEqual(first(z.error.issues));
      }
      casos++;
    }
    expect(casos).toBeGreaterThan(5000);
  });

  it("el retiro ignora cualquier dato extra (carritos viejos con otro punto de retiro)", () => {
    const input = { method: "retiro", pickupPoint: "viejo", locality: "x" };
    expect(DeliverySchema.safeParse(input).data).toEqual({ method: "retiro" });
    expect(validateDelivery(input)).toEqual({ success: true, data: { method: "retiro" } });
  });

  it("la expresión del código postal es la misma", () => {
    expect(postalCodeRegex.test("B1704ABC") && postalCodeRegex.test("1704") && !postalCodeRegex.test("17044")).toBe(true);
  });
});

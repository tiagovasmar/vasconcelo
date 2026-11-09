import { beforeEach, describe, expect, it } from "vitest";
import { catalog } from "@/content/catalog";
import { type Db } from "@/db/client";
import { PICKUP_ADDRESS, PICKUP_MESSAGE, PICKUP_NOTICE, paymentMethods } from "@/content/checkout-options";
import { CreateInquirySchema, isFullName } from "@/features/inquiries/schemas";
import { buildMessage, describeDelivery } from "@/features/inquiries/message";
import { createInquiry, hashToken, InquiryError } from "@/features/inquiries/service";
import { openTestDb } from "./helpers/pg";

let db: Db;
const owner = { sessionTokenHash: hashToken("sesion-nombre") };
let n = 0;
const body = (over: Record<string, unknown> = {}) => ({
  items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: 950000 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: `clave-nombre-${String(++n).padStart(8, "0")}`, ...over,
});
const fail = async (fn: () => unknown) => { try { await fn(); } catch (e) { if (e instanceof InquiryError) return e.info; throw e; } throw new Error("se esperaba un error"); };
beforeEach(async () => { db = await openTestDb(); });

describe("«Nombre y apellido» obligatorio en el servidor (también en el retiro)", () => {
  it.each([["falta", undefined], ["vacío", ""], ["solo espacios", "   "], ["una sola palabra", "Ana"], ["con números", "Ana 123"], ["con símbolos", "Ana <b>"], ["demasiado largo", `Ana ${"a".repeat(80)}`]])("lo rechaza si %s", async (_t, contactName) => {
    const err = await fail(async () => await createInquiry(db, body({ contactName }), owner));
    expect(err.code).toBe("invalid_input");
    expect((err.details as Array<{ path: string; message: string }>).some((d) => d.path === "contactName")).toBe(true);
  });
  it("acepta nombres reales con tildes, apóstrofes, guiones y espacios de más (se normalizan)", async () => {
    for (const nombre of ["Inés Muñoz", "María José   O'Brien", "Jean-Luc Pérez", "Ana de la Cruz"]) expect(isFullName(nombre), nombre).toBe(true);
    const { inquiry } = await createInquiry(db, body({ contactName: "  María   José  Pérez " }), owner);
    expect(inquiry.contactName).toBe("María José Pérez");
  });
  it("el mensaje de WhatsApp lleva el nombre, la entrega y el método de pago", async () => {
    const { inquiry } = await createInquiry(db, body({ contactName: "Ana Pérez" }), owner);
    expect(inquiry.message).toContain("Hola, soy Ana Pérez.");
    expect(inquiry.message).toContain("Nombre y apellido: Ana Pérez");
    expect(inquiry.message).toContain(`Entrega: ${PICKUP_MESSAGE}`);
    expect(inquiry.message).toContain("Método de pago: Efectivo · a coordinar");
  });
});

describe("retiro: una única opción", () => {
  it("no hay selección entre sucursales: el esquema solo pide method=retiro e ignora cualquier punto viejo", () => {
    expect(CreateInquirySchema.safeParse(body({ delivery: { method: "retiro" } })).success).toBe(true);
    const viejo = CreateInquirySchema.safeParse(body({ delivery: { method: "retiro", pickupPoint: "haedo" } }));
    expect(viejo.success && viejo.data.delivery).toEqual({ method: "retiro" });
    const ambas = CreateInquirySchema.safeParse(body({ delivery: { method: "retiro", pickupPoint: ["ramos-mejia", "haedo"] } }));
    expect(ambas.success && ambas.data.delivery).toEqual({ method: "retiro" });
  });
  it("el texto de retiro es el acordado y no promete retirar sin confirmación ni inventa horarios", () => {
    expect(PICKUP_NOTICE).toBe("Retiro en Av. Rivadavia 14600. Consultá por WhatsApp el horario para retirar y la dirección exacta.");
    expect(PICKUP_ADDRESS).toBe("Av. Rivadavia 14600");
    expect(describeDelivery({ method: "retiro" })).toBe(PICKUP_MESSAGE);
    expect(PICKUP_MESSAGE).toMatch(/horario y dirección exacta a confirmar por WhatsApp/);
    expect(`${PICKUP_NOTICE} ${PICKUP_MESSAGE}`).not.toMatch(/Ramos Mej|Haedo|\d{1,2}\s?(hs|h|:)|lunes|sábado|de \d+ a \d+/i);
  });
});

describe("envío según la entrega", () => {
  it("con retiro no hay línea de envío; con Andreani o moto vuelve la aclaración (mensaje definitivo del servidor)", async () => {
    const retiro = (await createInquiry(db, body(), owner)).inquiry.message;
    expect(retiro).not.toMatch(/Envío/);
    const andreani = (await createInquiry(db, body({ delivery: { method: "andreani", locality: "Haedo", province: "Buenos Aires", postalCode: "1706" } }), owner)).inquiry.message;
    expect(andreani).toContain("Envío: a coordinar (no está incluido en el total)");
    const moto = (await createInquiry(db, body({ delivery: { method: "moto", locality: "Haedo", postalCode: "1706" } }), owner)).inquiry.message;
    expect(moto).toContain("Envío: a coordinar (no está incluido en el total)");
  });
});

describe("métodos de pago: «Coordinar por WhatsApp» ya no existe", () => {
  it("quedan los dos vigentes y el servidor rechaza el eliminado con un mensaje claro", async () => {
    expect(paymentMethods.map((p) => p.id)).toEqual(["transferencia", "efectivo"]);
    const err = await fail(async () => await createInquiry(db, body({ payment: "coordinar" }), owner));
    expect(err.code).toBe("invalid_input");
    expect(JSON.stringify(err.details)).toMatch(/método de pago/);
  });
  it("transferencia y efectivo tienen el mismo importe", async () => {
    const caja = [{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }];
    const t = (await createInquiry(db, body({ payment: "transferencia", items: caja }), owner)).inquiry;
    const c = (await createInquiry(db, body({ payment: "efectivo", items: caja }), owner)).inquiry;
    expect(t.discountMinor).toBe(0);
    expect(c.discountMinor).toBe(0);
    const subtotal = catalog.products.find((p) => p.id === "storm-caja")!.priceMinor! + 2 * catalog.products.find((p) => p.id === "storm-sobre")!.priceMinor!;
    expect(t.subtotalMinor).toBe(subtotal);
    expect(c.subtotalMinor).toBe(subtotal);
  });
});

describe("mensaje de WhatsApp: subtotal y total destacados (un asterisco por lado)", () => {
  it("el subtotal y el total salen entre asteriscos con los importes del servidor, y el envío sigue aclarado", async () => {
    const { inquiry } = await createInquiry(db, body({ contactName: "Ana Pérez", items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: 950000 }, { productId: "storm-pack5", quantity: 1, expectedPriceMinor: 4200000 }] }), owner);
    const lineas = inquiry.message.split("\n");
    expect(lineas).toContain("*Subtotal: $ 61.000*");
    expect(lineas).toContain("*Total: $ 61.000*");
    expect(inquiry.message).not.toMatch(/Envío:/); // retiro: no se escribe «Envío a coordinar»
    expect(inquiry.message).toContain("Entrega: Retiro en Av. Rivadavia 14600 (horario y dirección exacta a confirmar por WhatsApp)");
    expect(inquiry.message.match(/\*[^*\n]+\*/g)).toEqual(["*Subtotal: $ 61.000*", "*Total: $ 61.000*"]);
  });
  it("con combo: subtotal sin descuento, descuento aparte y total con descuento", async () => {
    const caja = [{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }];
    const { inquiry } = await createInquiry(db, body({ payment: "transferencia", items: caja }), {
      ...owner,
      combo: { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre"] },
    });
    const lineas = inquiry.message.split("\n");
    expect(lineas.find((l) => l.startsWith("*Subtotal"))).toMatch(/^\*Subtotal: \$ [\d.]+\*$/);
    expect(lineas).toContain("Descuento combo caja + sobres: -$ 1.900");
    expect(lineas.find((l) => l.startsWith("*Total"))).toMatch(/^\*Total: \$ [\d.]+\*$/);
    expect(inquiry.discountMinor).toBe(0);
  });
  it("buildMessage: sin productos de stock (solo encargo) no inventa subtotal ni total", () => {
    const m = buildMessage({ reference: "TT-X", contactName: "Ana Pérez", lines: [{ quantity: 1, title: "Caja china", language: "zh", sku: "ZH-1", unitPriceMinor: null }], subtotalMinor: 0, delivery: { method: "retiro" }, paymentLabel: "Efectivo · a coordinar" });
    expect(m).not.toMatch(/Subtotal|Total:/);
    expect(m).toContain("Nombre y apellido: Ana Pérez");
  });
});

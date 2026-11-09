import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { inquiries } from "@/db/schema";
import { catalog } from "@/content/catalog";
import { allowRequest, createInquiry, getInquiryFor, hashToken, InquiryError, launchFor } from "@/features/inquiries/service";
import { evaluateCart } from "@/features/inquiries/pricing";
import { buildLaunch, buildMessage, WA_URL_SOFT_LIMIT, type MessageData } from "@/features/inquiries/message";
import { parseWhatsappNumber } from "@/features/inquiries/config";
import { CreateInquirySchema } from "@/features/inquiries/schemas";
import { formatARS } from "@/lib/format";

let db: Db;
const owner = { sessionTokenHash: hashToken("sesion-a") };
const key = (n: number | string) => `clave-de-prueba-${String(n).padStart(6, "0")}`;
const retiro = { method: "retiro" } as const;
const base = (over: Record<string, unknown> = {}) => ({
  items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: 950000 }, { productId: "storm-pack5", quantity: 1, expectedPriceMinor: 4200000 }],
  delivery: retiro, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: key(1), ...over,
});
const fail = async (fn: () => unknown) => {
  try { await fn(); } catch (e) { if (e instanceof InquiryError) return e.info; throw e; }
  throw new Error("se esperaba un error");
};

beforeEach(async () => {
  db = await openTestDb();
});

describe("importes y mensaje", () => {
  it("dos sobres de $9.500 y un pack de $42.000 suman $61.000; envío pendiente y separado", async () => {
    const { inquiry } = await createInquiry(db, base(), { sessionTokenHash: owner.sessionTokenHash });
    expect(inquiry.subtotalMinor).toBe(6100000);
    expect(formatARS(inquiry.subtotalMinor).replace(/\s/g, " ")).toMatch(/61\.000/);
    expect(inquiry.message).toContain("*Subtotal: $ 61.000*");
    expect(inquiry.message).toContain("*Total: $ 61.000*");
    expect(inquiry.message).not.toMatch(/Envío:/); // con retiro no hay envío
    expect(inquiry.message).not.toMatch(/Envío: \$/);
    expect(inquiry.message).not.toMatch(/importe final: \$/i);
    expect(inquiry.status).toBe("consulta_preparada");
  });
  it("el mensaje conserva tildes, saltos de línea, entrega y pago", async () => {
    const { inquiry } = await createInquiry(db, base({ contactName: "Inés Muñoz", delivery: { method: "andreani", locality: "Ramos Mejía", province: "Buenos Aires", postalCode: "1704" } }), { sessionTokenHash: owner.sessionTokenHash });
    expect(inquiry.message).toMatch(/^Hola, soy Inés Muñoz\. Quiero consultar este pedido:\nReferencia: TT-[A-Z2-9]{8}\n/);
    expect(inquiry.message).toContain("2 × Storm Emeralda · Sobre [Japonés] — SKU DEMO-STORM-SOBRE");
    expect(inquiry.message).toContain("Entrega: Andreani · Ramos Mejía, Buenos Aires (CP 1704)");
    expect(inquiry.message).toContain("Método de pago: Efectivo · a coordinar");
    expect(inquiry.message).toContain("Nombre y apellido: Inés Muñoz");
    expect(inquiry.message.endsWith("¿Me confirmás disponibilidad e importe final?")).toBe(true);
  });
  it("la URL de WhatsApp codifica y decodifica sin pérdida", async () => {
    const { inquiry } = await createInquiry(db, base({ contactName: "Inés Muñoz" }), { sessionTokenHash: owner.sessionTokenHash });
    const launch = launchFor(inquiry, "5491155550000");
    expect(launch.mode).toBe("full");
    const url = new URL(launch.url!);
    expect(url.origin + url.pathname).toBe("https://wa.me/5491155550000");
    expect(url.searchParams.get("text")).toBe(inquiry.message);
  });
  it("sin número configurado no hay URL (modo demo) pero sí texto para copiar", async () => {
    const { inquiry } = await createInquiry(db, base(), { sessionTokenHash: owner.sessionTokenHash });
    const launch = launchFor(inquiry, null);
    expect(launch.url).toBeNull();
    expect(launch.text.length).toBeGreaterThan(20);
    expect(parseWhatsappNumber("")).toBeNull();
    expect(parseWhatsappNumber("+54 9 11 5555-0000")).toBeNull();
    expect(parseWhatsappNumber("5491155550000")).toBe("5491155550000");
    expect(parseWhatsappNumber("123")).toBeNull();
  });
  it("carrito largo: usa resumen con referencia y conserva el detalle íntegro, sin truncar", async () => {
    const data: MessageData = {
      reference: "TT-LARGO234", lines: Array.from({ length: 40 }, (_, i) => ({ quantity: 3, title: `Producto de nombre bastante largo número ${i}`, language: "ja" as const, sku: `SKU-LARGO-${i}`, unitPriceMinor: 123400 + i })),
      subtotalMinor: 99999900, delivery: retiro, paymentLabel: "Efectivo · a coordinar",
    };
    const full = buildMessage(data);
    expect(encodeURIComponent(full).length).toBeGreaterThan(WA_URL_SOFT_LIMIT);
    const launch = buildLaunch("5491155550000", data, full);
    expect(launch.mode).toBe("summary");
    expect(launch.text).toContain("TT-LARGO234");
    expect(launch.text).toContain("40 productos distintos (120 unidades)");
    expect(launch.url!.length).toBeLessThan(WA_URL_SOFT_LIMIT);
    expect(full).toContain("SKU-LARGO-39"); // el detalle completo sigue íntegro
    expect(full.match(/× /g)).toHaveLength(40);
  });
});

describe("validación en servidor", () => {
  it("manipular el precio en el navegador no sirve: se usa el del catálogo", async () => {
    const body = base({ items: [{ productId: "storm-sobre", quantity: 1, expectedPriceMinor: 100, priceMinor: 100, unitPriceMinor: 100, price: 1, total: 1, subtotalMinor: 1 }], total: 1 });
    const err = await fail(async () => await createInquiry(db, body, { sessionTokenHash: owner.sessionTokenHash }));
    expect(err.code).toBe("price_changed"); // avisa, y aun aceptando usa el vigente
    const ok = await createInquiry(db, { ...body, acceptPriceChanges: true }, { sessionTokenHash: owner.sessionTokenHash });
    expect(ok.inquiry.lines[0].unitPriceMinor).toBe(950000);
    expect(ok.inquiry.subtotalMinor).toBe(950000);
  });
  it("avisa si cambió el precio antes de continuar", async () => {
    const err = await fail(async () => await createInquiry(db, base({ items: [{ productId: "storm-caja", quantity: 1, expectedPriceMinor: 17000000 }] }), { sessionTokenHash: owner.sessionTokenHash }));
    expect(err).toMatchObject({ status: 409, code: "price_changed" });
    expect(JSON.stringify(err.details)).toContain("17000000");
    expect((await db.select().from(inquiries))).toHaveLength(0);
  });
  it("rechaza cantidades negativas, cero, fraccionarias y no numéricas", async () => {
    for (const q of [-1, 0, 1.5, "2", null, 100]) {
      const err = await fail(async () => await createInquiry(db, base({ items: [{ productId: "storm-sobre", quantity: q }] }), { sessionTokenHash: owner.sessionTokenHash }));
      expect(err.code).toBe("invalid_input");
    }
  });
  it("SKU desconocido, retirado, agotado y por encima del límite o stock", async () => {
    const ctx = { sessionTokenHash: owner.sessionTokenHash };
    expect((await fail(async () => await createInquiry(db, base({ items: [{ productId: "no-existe", quantity: 1 }] }), ctx))).code).toBe("unavailable");
    expect((await fail(async () => await createInquiry(db, base({ items: [{ productId: "parcial-bundle", quantity: 1 }] }), ctx))).code).toBe("out_of_stock");
    const retirado = catalog.products.map((p) => (p.id === "storm-sobre" ? { ...p, active: false } : p));
    expect((await fail(async () => await createInquiry(db, base(), { ...ctx, products: retirado }))).code).toBe("unavailable");
    expect((await fail(async () => await createInquiry(db, base({ items: [{ productId: "storm-caja", quantity: 3 }] }), ctx))).code).toBe("over_limit"); // máx. 2 por pedido
    expect((await fail(async () => await createInquiry(db, base({ items: [{ productId: "ejemplo-caja", quantity: 3 }] }), ctx))).code).toBe("over_limit");
  });
  it("rechaza líneas repetidas y carritos vacíos", async () => {
    const ctx = { sessionTokenHash: owner.sessionTokenHash };
    expect((await fail(async () => await createInquiry(db, base({ items: [{ productId: "storm-sobre", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }] }), ctx))).code).toBe("invalid_input");
    expect((await fail(async () => await createInquiry(db, base({ items: [] }), ctx))).code).toBe("invalid_input");
  });
  it("entrega: exige los campos de cada modalidad y no pide DNI ni dirección completa", async () => {
    const ctx = { sessionTokenHash: owner.sessionTokenHash };
    const bad = async (delivery: unknown) => await fail(async () => await createInquiry(db, base({ delivery }), ctx));
    expect((await bad({ method: "andreani", locality: "Haedo" })).code).toBe("invalid_input");
    expect((await bad({ method: "andreani", locality: "Haedo", province: "Buenos Aires", postalCode: "17" })).code).toBe("invalid_input");
    expect((await bad({ method: "andreani", locality: "Haedo", province: "Narnia", postalCode: "1706" })).code).toBe("invalid_input");
    expect((await bad({ method: "moto", locality: "", postalCode: "1706" })).code).toBe("invalid_input");
    // Un único punto de retiro: un `pickupPoint` viejo se ignora (no hay nada que elegir) y no se guarda.
    expect(CreateInquirySchema.safeParse(base({ delivery: { method: "retiro", pickupPoint: "moron" } })).success).toBe(true);
    expect(CreateInquirySchema.safeParse(base({ delivery: { method: "retiro", pickupPoint: "moron" } })).data?.delivery).toEqual({ method: "retiro" });
    expect((await bad({ method: "correo" })).code).toBe("invalid_input");
    expect(CreateInquirySchema.safeParse(base({ delivery: { method: "moto", locality: "Haedo", postalCode: "B1706ABC" } })).success).toBe(true);
  });
  it("solo acepta preferencias de pago habilitadas", async () => {
    const err = await fail(async () => await createInquiry(db, base({ payment: "metodo-no-habilitado" }), { sessionTokenHash: owner.sessionTokenHash }));
    expect(err.code).toBe("invalid_input");
  });
  it.each([
    ["transferencia", "Transferencia"],
    ["efectivo", "Efectivo · a coordinar"],
  ])("conserva las condiciones de %s en la consulta y en WhatsApp (pedido con una caja)", async (payment, label) => {
    const result = await createInquiry(db, base({ payment, items: [{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }] }), { sessionTokenHash: owner.sessionTokenHash });
    expect(result.inquiry.paymentLabel).toBe(label);
    expect(result.inquiry.message).toContain(`Método de pago: ${label}`);
    const data: MessageData = { reference: result.inquiry.reference, lines: result.inquiry.lines, subtotalMinor: result.inquiry.subtotalMinor, delivery: retiro, paymentLabel: label };
    const launch = buildLaunch("5491155550000", data, "x".repeat(2000));
    expect(launch.mode).toBe("summary");
    expect(launch.text).toContain(label);
    expect(launch.text).toContain("Retiro en Av. Rivadavia 14600");
    expect(launch.text).not.toMatch(/Ramos Mej|Haedo/);
  });
  it("evaluateCart: estados por línea", async () => {
    const ev = evaluateCart([{ productId: "storm-sobre", quantity: 1, expectedPriceMinor: 950000 }, { productId: "parcial-bundle", quantity: 1 }, { productId: "x", quantity: 1 }, { productId: "storm-pack5", quantity: 9 }], catalog.products);
    expect(ev.lines.map((l) => l.status)).toEqual(["ok", "out_of_stock", "unavailable", "over_limit"]);
    expect(ev.blocking).toHaveLength(3);
  });
});

describe("idempotencia, privacidad y persistencia", () => {
  it("la misma clave y el mismo contenido devuelven una sola consulta", async () => {
    const a = await createInquiry(db, base(), { sessionTokenHash: owner.sessionTokenHash });
    const b = await createInquiry(db, base({ items: [...base().items].reverse() }), { sessionTokenHash: owner.sessionTokenHash });
    expect(b.replayed).toBe(true);
    expect(b.inquiry.reference).toBe(a.inquiry.reference);
    expect((await db.select().from(inquiries))).toHaveLength(1);
  });
  it("la misma clave con contenido distinto se rechaza (no se reutiliza)", async () => {
    await createInquiry(db, base(), { sessionTokenHash: owner.sessionTokenHash });
    const err = await fail(async () => await createInquiry(db, base({ items: [{ productId: "storm-sobre", quantity: 3 }] }), { sessionTokenHash: owner.sessionTokenHash }));
    expect(err.code).toBe("idempotency_conflict");
    expect((await db.select().from(inquiries))).toHaveLength(1);
  });
  it("otra sesión no puede reutilizar la clave ni leer la consulta", async () => {
    const a = await createInquiry(db, base(), { sessionTokenHash: owner.sessionTokenHash });
    const otro = { sessionTokenHash: hashToken("sesion-b") };
    expect((await fail(async () => await createInquiry(db, base(), otro))).code).toBe("idempotency_conflict");
    expect(await getInquiryFor(db, a.inquiry.reference, otro)).toBeNull();
    expect(await getInquiryFor(db, a.inquiry.reference, {})).toBeNull();
    expect((await getInquiryFor(db, a.inquiry.reference, owner))?.reference).toBe(a.inquiry.reference);
  });
  describe("invitado sin cookie cuya respuesta se perdió (primera visita)", () => {
    const nuevo = (n: string, extra: Record<string, unknown> = {}) => ({ sessionTokenHash: hashToken(n), sessionIsNew: true, ...extra });
    it("el reintento con la misma clave y el mismo contenido recupera la MISMA consulta (no se duplica) y la asocia a la sesión nueva", async () => {
      const a = await createInquiry(db, base(), { sessionTokenHash: owner.sessionTokenHash, sessionIsNew: true });
      const b = await createInquiry(db, base(), nuevo("sesion-nueva-tras-corte"));
      expect(b.replayed).toBe(true);
      expect(b.inquiry.reference).toBe(a.inquiry.reference);
      expect(await db.select().from(inquiries)).toHaveLength(1);
      expect((await getInquiryFor(db, a.inquiry.reference, { sessionTokenHash: hashToken("sesion-nueva-tras-corte") }))?.reference).toBe(a.inquiry.reference);
      expect(await getInquiryFor(db, a.inquiry.reference, owner)).toBeNull(); // la sesión anterior (la cookie que nunca llegó) ya no es la dueña
    });
    it("no aplica con otro contenido, pasada la ventana, con cuenta iniciada o si la petición YA traía una cookie distinta", async () => {
      const a = await createInquiry(db, base(), { sessionTokenHash: owner.sessionTokenHash });
      expect((await fail(async () => await createInquiry(db, base({ items: [{ productId: "storm-sobre", quantity: 3 }] }), nuevo("otra-1")))).code).toBe("idempotency_conflict");
      expect((await fail(async () => await createInquiry(db, base(), nuevo("otra-2", { now: a.inquiry.createdAt + 31 * 60 * 1000 })))).code).toBe("idempotency_conflict");
      expect((await fail(async () => await createInquiry(db, base(), nuevo("otra-3", { userId: "usuario-x" })))).code).toBe("idempotency_conflict");
      expect((await fail(async () => await createInquiry(db, base(), { sessionTokenHash: hashToken("otra-4"), sessionIsNew: false }))).code).toBe("idempotency_conflict");
      expect(await getInquiryFor(db, a.inquiry.reference, owner)).not.toBeNull(); // la dueña original sigue siéndolo
    });
  });
  it("la referencia no es secuencial ni adivinable", async () => {
    const refs = await Promise.all(Array.from({ length: 30 }, async (_, i) => (await createInquiry(db, base({ idempotencyKey: key(i + 10) }), { sessionTokenHash: owner.sessionTokenHash })).inquiry.reference));
    expect(new Set(refs).size).toBe(30);
    for (const r of refs) expect(r).toMatch(/^TT-[A-Z2-9]{8}$/);
  });
  it("el snapshot es inmutable: no cambia si el catálogo cambia después", async () => {
    const a = await createInquiry(db, base(), { sessionTokenHash: owner.sessionTokenHash });
    const mas = catalog.products.map((p) => ({ ...p, priceMinor: (p.priceMinor ?? 0) * 2 }));
    const again = await createInquiry(db, base(), { sessionTokenHash: owner.sessionTokenHash, products: mas });
    expect(again.inquiry.subtotalMinor).toBe(a.inquiry.subtotalMinor);
  });
  it("abrir WhatsApp no cambia el estado ni el stock del catálogo", async () => {
    const stockAntes = catalog.products.map((p) => p.stockQuantity);
    const { inquiry } = await createInquiry(db, base(), { sessionTokenHash: owner.sessionTokenHash });
    launchFor(inquiry, "5491155550000");
    const row = (await db.select().from(inquiries).where(eq(inquiries.id, inquiry.reference)))[0]!;
    expect(row.status).toBe("consulta_preparada");
    expect(catalog.products.map((p) => p.stockQuantity)).toEqual(stockAntes);
  });
  it("no guarda contraseñas ni datos innecesarios (sin DNI ni dirección completa)", async () => {
    const { inquiry } = await createInquiry(db, base({ dni: "12345678", address: "Calle falsa 123", password: "x" }), { sessionTokenHash: owner.sessionTokenHash });
    const row = (await db.select().from(inquiries).where(eq(inquiries.id, inquiry.reference)))[0]!;
    expect(JSON.stringify(row)).not.toMatch(/12345678|Calle falsa|password/);
  });
  it("límite de uso persistente por clave", async () => {
    const t = 1_000_000;
    expect(await Promise.all([1, 2, 3].map(async () => await allowRequest(db, "ip-1:consultas", 3, 3600, t)))).toEqual([true, true, true]); // simultáneas: el contador es atómico
    expect(await allowRequest(db, "ip-1:consultas", 3, 3600, t + 10)).toBe(false);
    expect(await allowRequest(db, "ip-2:consultas", 3, 3600, t + 10)).toBe(true);
    expect(await allowRequest(db, "ip-1:consultas", 3, 3600, t + 3_700_000)).toBe(true); // ventana nueva
  });
});

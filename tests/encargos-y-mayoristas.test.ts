import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { catalog } from "@/content/catalog";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { inquiries, inquiryLines, user, wholesaleRequests } from "@/db/schema";
import { createInquiry, getInquiryFor, hashToken, InquiryError, listInquiriesForUser } from "@/features/inquiries/service";
import { createWholesaleRequest, getWholesaleRequest, listWholesaleRequests, reviewWholesaleRequest, WholesaleError, wholesaleStatusFor } from "@/features/wholesale/service";

let db: Db;
const now = new Date();
const addUser = async (id: string) => await db.insert(user).values({ id, name: `Usuario ${id}`, email: `${id}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
const owner = { sessionTokenHash: hashToken("sesion-encargos") };
const retiro = { method: "retiro" } as const;
const key = (n: number) => `clave-encargo-${String(n).padStart(8, "0")}`;
const body = (n: number, items: Array<Record<string, unknown>>, over: Record<string, unknown> = {}) => ({ items, delivery: retiro, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: key(n), ...over });
const fail = async (fn: () => unknown) => {
  try { await fn(); } catch (e) { if (e instanceof InquiryError) return e.info; if (e instanceof WholesaleError) return e.info; throw e; }
  throw new Error("se esperaba un error");
};
/** Catálogo donde un producto no tiene precio ni stock (como los 52 reales): solo se puede consultar por encargo. */
const conPendiente = catalog.products.map((p) => (p.id === "storm-sobre" ? { ...p, priceMinor: null, stockQuantity: null } : p));

beforeEach(async () => {
  db = await openTestDb();
  await addUser("ana");
  await addUser("beto");
});

describe("consulta por encargo", () => {
  it("un producto sin precio ni stock se puede consultar por encargo y se guarda SIN precio ni cotización", async () => {
    const { inquiry } = await createInquiry(db, body(1, [{ productId: "storm-sobre", quantity: 3, mode: "encargo" }]), { ...owner, products: conPendiente });
    expect(inquiry.subtotalMinor).toBe(0);
    expect(inquiry.discountMinor).toBe(0);
    expect(inquiry.lines).toHaveLength(1);
    expect(inquiry.lines[0]).toMatchObject({ fulfillment: "encargo", quantity: 3, unitPriceMinor: null, lineSubtotalMinor: null });
    expect(inquiry.message).toContain("Por encargo (disponibilidad y cotización a confirmar):");
    expect(inquiry.message).toContain("3 × Storm Emeralda · Sobre [Japonés] — SKU DEMO-STORM-SOBRE");
    expect(inquiry.message).not.toMatch(/Subtotal|Total:|Unitario|\$/);
    expect(inquiry.message).toContain("seña es del 20% de lo cotizado y el saldo del 80%");
    expect(inquiry.message.endsWith("¿Me confirmás disponibilidad y cotización de lo que pedí por encargo?")).toBe(true);
    expect(inquiry.status).toBe("consulta_preparada"); // no es una compra, una reserva ni un pago
  });
  it("comprar un producto pendiente sigue rechazado (409): solo se consulta por encargo", async () => {
    expect((await fail(async () => await createInquiry(db, body(2, [{ productId: "storm-sobre", quantity: 1 }]), { ...owner, products: conPendiente }))).code).toBe("pending_commercial");
  });
  it("el cliente no puede fijar un precio: un encargo ignora el precio y el stock que mande", async () => {
    const { inquiry } = await createInquiry(db, body(3, [{ productId: "storm-sobre", quantity: 2, mode: "encargo", expectedPriceMinor: 1 }]), { ...owner, products: conPendiente });
    expect(inquiry.lines[0].unitPriceMinor).toBeNull();
    const row = (await db.select().from(inquiryLines).where(eq(inquiryLines.inquiryId, inquiry.reference)))[0]!;
    expect(row.fulfillment).toBe("encargo");
    expect(row.unitPriceMinor).toBe(0);
  });
  it("pedido mixto: lo disponible con su importe y lo que se encarga aparte; no se cobra seña de todo el carrito", async () => {
    const { inquiry } = await createInquiry(db, body(4, [{ productId: "storm-pack5", quantity: 1 }, { productId: "storm-sobre", quantity: 2, mode: "encargo" }]), { ...owner, products: conPendiente });
    expect(inquiry.subtotalMinor).toBe(4200000); // solo el pack disponible
    expect(inquiry.lines.map((l) => l.fulfillment).sort()).toEqual(["encargo", "stock"]);
    expect(inquiry.message).toContain("Para comprar (disponibles):");
    expect(inquiry.message).toContain("Por encargo (disponibilidad y cotización a confirmar):");
    expect(inquiry.message).toContain("*Subtotal: $ 42.000* (sin los productos por encargo)");
    expect(inquiry.message).not.toMatch(/seña.*\$/);
  });
  it("un producto agotado también se puede consultar por encargo", async () => {
    const { inquiry } = await createInquiry(db, body(5, [{ productId: "parcial-bundle", quantity: 1, mode: "encargo" }]), { ...owner });
    expect(inquiry.lines[0].fulfillment).toBe("encargo");
  });
  it("un producto fuera del catálogo o inactivo no se puede ni consultar por encargo", async () => {
    expect((await fail(async () => await createInquiry(db, body(6, [{ productId: "no-existe", quantity: 1, mode: "encargo" }]), owner))).code).toBe("unavailable");
  });
  it("misma clave y mismo contenido → la misma consulta; cambiar de compra a encargo es otro contenido", async () => {
    const a = await createInquiry(db, body(7, [{ productId: "storm-sobre", quantity: 1 }]), owner);
    const b = await createInquiry(db, body(7, [{ productId: "storm-sobre", quantity: 1 }]), owner);
    expect(b.replayed).toBe(true);
    expect(b.inquiry.reference).toBe(a.inquiry.reference);
    expect((await fail(async () => await createInquiry(db, body(7, [{ productId: "storm-sobre", quantity: 1, mode: "encargo" }]), owner))).code).toBe("idempotency_conflict");
  });
  it("«Mis consultas» cuenta las líneas por encargo", async () => {
    await createInquiry(db, body(8, [{ productId: "storm-sobre", quantity: 2, mode: "encargo" }]), { sessionTokenHash: hashToken("x"), userId: "ana", products: conPendiente });
    const [s] = await listInquiriesForUser(db, "ana");
    expect(s).toMatchObject({ subtotalMinor: 0, encargoLines: 1, units: 2 });
    expect((await getInquiryFor(db, s.reference, { userId: "ana" }))!.lines[0].lineSubtotalMinor).toBeNull();
    expect(await getInquiryFor(db, s.reference, { userId: "beto" })).toBeNull();
  });
});

describe("promoción por caja en la consulta (servidor)", () => {
  const caja = { productId: "storm-caja", quantity: 1 };
  const sobre = { productId: "storm-sobre", quantity: 2 };
  it("caja sola con transferencia: 10% de descuento guardado y escrito en el mensaje", async () => {
    const { inquiry } = await createInquiry(db, body(10, [caja], { payment: "transferencia" }), owner);
    expect(inquiry.subtotalMinor).toBe(18500000);
    expect(inquiry.discountMinor).toBe(1850000);
    expect(inquiry.message).toContain("Descuento por transferencia: -$ 18.500");
    expect(inquiry.message).toContain("*Total: $ 166.500*");
    expect((await db.select().from(inquiries).where(eq(inquiries.id, inquiry.reference)))[0]!.discountMinor).toBe(1850000);
  });
  it("caja + sobres con transferencia: el 10% alcanza a todo el subtotal de productos; el envío queda aparte", async () => {
    const { inquiry } = await createInquiry(db, body(11, [caja, sobre], { payment: "transferencia" }), owner);
    expect(inquiry.subtotalMinor).toBe(20400000);
    expect(inquiry.discountMinor).toBe(2040000);
    expect(inquiry.message).toContain("Envío: a coordinar");
  });
  it("cuotas con una caja: se acepta y no hay descuento (son alternativas)", async () => {
    const { inquiry } = await createInquiry(db, body(12, [caja], { payment: "tarjeta-3-cuotas" }), owner);
    expect(inquiry.discountMinor).toBe(0);
    expect(inquiry.paymentLabel).toContain("3 cuotas sin interés");
  });
  it("sobres solos con cuotas o transferencia: rechazado (409 promo_not_eligible)", async () => {
    for (const [n, payment] of [[13, "transferencia"], [14, "tarjeta-3-cuotas"]] as const) {
      const err = await fail(async () => await createInquiry(db, body(n, [sobre], { payment }), owner));
      expect(err.code).toBe("promo_not_eligible");
      expect(err.status).toBe(409);
    }
    expect((await db.select().from(inquiries))).toHaveLength(0); // no se guardó nada
  });
  it("una caja que solo se consulta por encargo no habilita la promoción", async () => {
    expect((await fail(async () => await createInquiry(db, body(15, [{ ...caja, mode: "encargo" }, sobre], { payment: "transferencia" }), owner))).code).toBe("promo_not_eligible");
  });
  it("efectivo vale siempre y sin descuento (el 10% no se extendió al efectivo)", async () => {
    const { inquiry } = await createInquiry(db, body(16, [sobre], { payment: "efectivo" }), owner);
    expect(inquiry.discountMinor).toBe(0);
  });
  it("«A coordinar por WhatsApp» ya no existe: el servidor lo rechaza y pide elegir un método vigente", async () => {
    const err = await fail(async () => await createInquiry(db, body(17, [sobre], { payment: "coordinar" }), owner));
    expect(err.code).toBe("invalid_input");
    expect(JSON.stringify(err.details)).toContain("método de pago");
    expect((await db.select().from(inquiries))).toHaveLength(0);
  });
});

describe("solicitudes de cuenta mayorista", () => {
  const datos = { businessName: "Cartas del Oeste", locality: "Ramos Mejía", province: "Buenos Aires", note: "Busco cajas de las ediciones chinas" };
  it("una persona con cuenta solicita la condición mayorista: queda PENDIENTE y sin ningún beneficio", async () => {
    const { request, replayed } = await createWholesaleRequest(db, "ana", datos);
    expect(replayed).toBe(false);
    expect(request).toMatchObject({ status: "pendiente", businessName: "Cartas del Oeste", locality: "Ramos Mejía", province: "Buenos Aires", note: "Busco cajas de las ediciones chinas" });
    expect(request.reference).toMatch(/^MY-[A-Z2-9]{8}$/);
    expect(await wholesaleStatusFor(db, "ana")).toBe("pendiente");
    expect(await wholesaleStatusFor(db, "beto")).toBeNull();
  });
  it("no hay duplicados: repetir la solicitud devuelve la existente y no la pisa", async () => {
    const a = await createWholesaleRequest(db, "ana", datos);
    const b = await createWholesaleRequest(db, "ana", { ...datos, businessName: "Otro nombre" });
    expect(b.replayed).toBe(true);
    expect(b.request.reference).toBe(a.request.reference);
    expect(b.request.businessName).toBe("Cartas del Oeste");
    expect((await db.select().from(wholesaleRequests))).toHaveLength(1);
  });
  it("persistencia: se lee de la base con otra conexión al mismo estado; cada cuenta ve solo la suya", async () => {
    await createWholesaleRequest(db, "ana", datos);
    await createWholesaleRequest(db, "beto", { ...datos, businessName: "Beto TCG" });
    expect((await getWholesaleRequest(db, "ana"))!.businessName).toBe("Cartas del Oeste");
    expect((await getWholesaleRequest(db, "beto"))!.businessName).toBe("Beto TCG");
    expect((await listWholesaleRequests(db)).map((r) => r.email).sort()).toEqual(["ana@example.com", "beto@example.com"]);
  });
  it("valida los datos: nombre, localidad y provincia obligatorios; nota opcional y acotada; sin documentos", async () => {
    const bad = async (over: Record<string, unknown>) => await fail(async () => await createWholesaleRequest(db, "ana", { ...datos, ...over }));
    expect((await bad({ businessName: "" })).code).toBe("invalid_input");
    expect((await bad({ locality: "x" })).code).toBe("invalid_input");
    expect((await bad({ province: "Atlántida" })).code).toBe("invalid_input");
    expect((await bad({ note: "x".repeat(501) })).code).toBe("invalid_input");
    expect((await createWholesaleRequest(db, "ana", { businessName: "Solo lo mínimo", locality: "Haedo", province: "Buenos Aires" })).request.note).toBeUndefined();
  });
  it("el usuario sale de la sesión: el cuerpo no puede traer userId, estado ni porcentaje", async () => {
    const { request } = await createWholesaleRequest(db, "ana", { ...datos, userId: "beto", status: "aprobada", discountPercent: 90 });
    expect(request.status).toBe("pendiente");
    expect(await getWholesaleRequest(db, "beto")).toBeNull();
    expect((await db.select().from(wholesaleRequests))[0]!.userId).toBe("ana");
  });
  it("revisar (aprobar/rechazar) está APAGADO hasta que el dueño defina las políticas: 409 y no cambia nada", async () => {
    const { request } = await createWholesaleRequest(db, "ana", datos);
    const err = await fail(async () => await reviewWholesaleRequest(db, request.reference, "aprobada", "dueno@example.com"));
    expect(err).toMatchObject({ status: 409, code: "policy_pending" });
    expect(await wholesaleStatusFor(db, "ana")).toBe("pendiente");
  });
  it("el mecanismo de revisión está listo: con la activación habilitada cambia el estado y deja constancia", async () => {
    const { request } = await createWholesaleRequest(db, "ana", datos);
    const r = await reviewWholesaleRequest(db, request.reference, "rechazada", "dueno@example.com", { activationEnabled: true, now: 1_700_000_000_000 });
    expect(r.status).toBe("rechazada");
    const row = (await db.select().from(wholesaleRequests))[0]!;
    expect(row).toMatchObject({ reviewedByEmail: "dueno@example.com", reviewedAt: 1_700_000_000_000 });
    expect((await fail(async () => await reviewWholesaleRequest(db, "MY-NOEXISTE", "aprobada", "d@e.com", { activationEnabled: true }))).code).toBe("not_found");
  });
  it("borrar la cuenta borra su solicitud (clave foránea en cascada)", async () => {
    await createWholesaleRequest(db, "ana", datos);
    await db.delete(user).where(eq(user.id, "ana"));
    expect((await db.select().from(wholesaleRequests))).toHaveLength(0);
  });
});

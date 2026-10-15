import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoCatalog } from "@/content/catalog";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { productOverrides } from "@/db/schema";
import { commercialState } from "@/features/catalog/commercial";
import { evaluateCart } from "@/features/inquiries/pricing";
import { AdminError, ProductEditSchema, adminProducts, applyOverrides, listAudit, loadOverrides, resetProduct, saveProductChange } from "@/features/catalog/overrides";
import type { EffectiveRate } from "@/features/fx/convert";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/server/session", () => ({ getUser: async () => null, userFromRequest: async () => null }));

const base = demoCatalog.products;
const actor = { id: "u1", email: "dueno@example.com" };
/** Cotización de prueba: 1.234 pesos por dólar (valor sintético, no una cotización vigente). */
const FX: EffectiveRate = { status: "manual", mode: "manual", rate10k: 12_340_000, asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false };
const NOFX: EffectiveRate = { status: "none", mode: "auto", rate10k: null, asOf: null, providerUpdatedAt: null, source: "prueba", warn: false };
/** Edición parcial: lo que no se envía conserva su valor. */
const edit = (o: Partial<Parameters<typeof saveProductChange>[3]> = {}) => ({ expectedVersion: 0, ...o });
const view = async (fx: EffectiveRate | null = FX) => applyOverrides(base, await loadOverrides(db), fx);
let db: Db;
beforeEach(async () => { db = await openTestDb(); });

describe("valores del panel sobre el catálogo por código", () => {
  it("sin cambios del panel rigen los valores del código (los productos de demostración conservan su precio ARS fijo)", async () => {
    expect(applyOverrides(base, await loadOverrides(db)).map((p) => ({ ...p, priceUsdMinor: undefined }))).toEqual(base.map((p) => ({ ...p, priceUsdMinor: undefined })));
  });

  it("guarda el precio en USD, lo convierte con la cotización y registra quién, cuándo y valores anteriores", async () => {
    const r = await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000, stock: 7, maxPerOrder: 3 }), actor, 1_000);
    expect(r.changed.sort()).toEqual(["max_per_order", "price_usd_minor", "stock_quantity"]);
    const p = (await view()).find((x) => x.id === "storm-sobre")!;
    expect(p).toMatchObject({ priceUsdMinor: 1000, priceMinor: 1_230_000, stockQuantity: 7, maxPerOrder: 3, active: true }); // USD 10 × 1.234 = $12.340 → $12.300
    expect(base.find((x) => x.id === "storm-sobre")!.priceMinor).toBe(950_000); // el catálogo base no se muta
    const log = await listAudit(db, { productId: "storm-sobre" });
    expect(log).toHaveLength(3);
    expect(log.find((l) => l.field === "price_usd_minor")).toMatchObject({ oldValue: "null", newValue: "1000", userEmail: "dueno@example.com", userId: "u1", createdAt: 1_000, sku: "DEMO-STORM-SOBRE" });
    expect(log.find((l) => l.field === "stock_quantity")).toMatchObject({ oldValue: "24", newValue: "7" });
  });

  it("el precio en pesos NO se guarda: cambia con la cotización sin tocar el USD", async () => {
    await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000 }), actor, 1_000);
    expect((await view(FX)).find((x) => x.id === "storm-sobre")!.priceMinor).toBe(1_230_000);
    expect((await view({ ...FX, rate10k: 12_350_000 })).find((x) => x.id === "storm-sobre")!.priceMinor).toBe(1_240_000); // 12.350 → mitad hacia arriba
    expect((await loadOverrides(db)).get("storm-sobre")!.priceMinor).toBeNull();
  });

  it("sin cotización utilizable el precio en pesos queda PENDIENTE (nunca $0) y el USD se conserva", async () => {
    await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000 }), actor, 1_000);
    const p = (await view(NOFX)).find((x) => x.id === "storm-sobre")!;
    expect(p.priceMinor).toBeNull();
    expect(p.priceUsdMinor).toBe(1000);
    expect(commercialState(p)).toBe("pending");
    expect((await view(null)).find((x) => x.id === "storm-sobre")!.priceMinor).toBeNull();
  });

  it("registra el valor ANTERIOR vigente (el del panel, no el del código) en cambios sucesivos", async () => {
    const a = await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000 }), actor, 1_000);
    await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1100, expectedVersion: a.version }), actor, 2_000);
    const prices = (await listAudit(db, { productId: "storm-sobre" })).filter((l) => l.field === "price_usd_minor");
    expect(prices.map((l) => [l.oldValue, l.newValue])).toEqual([["1000", "1100"], ["null", "1000"]]); // más nuevo primero
  });

  it("no escribe nada si no cambia nada", async () => {
    const r = await saveProductChange(db, base, "storm-sobre", edit(), actor);
    expect(r.changed).toEqual([]);
    expect((await loadOverrides(db)).size).toBe(0);
    expect(await listAudit(db)).toHaveLength(0);
  });

  it("edición parcial: la edición rápida de precio y stock no pisa título, descripción ni máximo", async () => {
    const a = await saveProductChange(db, base, "storm-sobre", edit({ title: "Título propio de prueba", description: "Descripción propia de prueba para la ficha.", maxPerOrder: 4 }), actor, 1_000);
    await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 900, stock: 3, expectedVersion: a.version }), actor, 2_000);
    expect((await view()).find((x) => x.id === "storm-sobre")).toMatchObject({ title: "Título propio de prueba", description: "Descripción propia de prueba para la ficha.", maxPerOrder: 4, priceUsdMinor: 900, stockQuantity: 3 });
  });

  it("un título igual al del código no queda como reemplazo; null devuelve al del código", async () => {
    const code = base.find((x) => x.id === "storm-sobre")!;
    await saveProductChange(db, base, "storm-sobre", edit({ title: code.title, stock: 5 }), actor, 1_000);
    expect((await loadOverrides(db)).get("storm-sobre")!.title).toBeNull();
    const a = await saveProductChange(db, base, "storm-sobre", edit({ title: "Otro nombre", expectedVersion: 1_000 }), actor, 2_000);
    await saveProductChange(db, base, "storm-sobre", edit({ title: null, expectedVersion: a.version }), actor, 3_000);
    expect((await view()).find((x) => x.id === "storm-sobre")!.title).toBe(code.title);
  });

  it("precio o stock vacíos = pendiente (null), distinto de $0 y de agotado; «por encargo» es otro estado", async () => {
    const first = await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000 }), actor, 500);
    await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: null, expectedVersion: first.version }), actor, 1_000);
    let p = (await view()).find((x) => x.id === "storm-sobre")!;
    expect(p.priceMinor).toBeNull();
    expect(commercialState(p)).toBe("pending");
    await saveProductChange(db, base, "storm-caja", edit({ priceUsdMinor: 15000, stock: 0, maxPerOrder: 2 }), actor, 1_000);
    p = (await view()).find((x) => x.id === "storm-caja")!;
    expect(commercialState(p)).toBe("soldout");
    await saveProductChange(db, base, "storm-pack5", edit({ priceUsdMinor: 3000, stock: null, maxPerOrder: 5 }), actor, 1_000);
    p = (await view()).find((x) => x.id === "storm-pack5")!;
    expect(p.stockQuantity).toBeNull();
    expect(commercialState(p)).toBe("pending");
    const b = await saveProductChange(db, base, "storm-pack5", edit({ stock: 0, orderOnly: true, expectedVersion: 1_000 }), actor, 2_000);
    p = (await view()).find((x) => x.id === "storm-pack5")!;
    expect(p.orderOnly).toBe(true);
    expect(commercialState(p)).toBe("soldout"); // no se compra de stock: se consulta por encargo
    expect(b.changed).toContain("order_only");
  });

  it("«solo por encargo» con stock disponible se rechaza", async () => {
    await expect(saveProductChange(db, base, "storm-pack5", edit({ orderOnly: true, stock: 4 }), actor)).rejects.toThrow(/por encargo/i);
    expect((await loadOverrides(db)).size).toBe(0);
  });

  it("un precio en ARS cargado antes (legado) no rige ni se convierte: queda como dato anterior", async () => {
    await db.insert(productOverrides).values({ productId: "storm-sobre", priceMinor: 1_500_000, stockQuantity: 9, maxPerOrder: null, visible: true, orderOnly: false, updatedAt: 5, updatedByEmail: "dueno@example.com" });
    const p = (await view()).find((x) => x.id === "storm-sobre")!;
    expect(p.priceMinor).toBeNull(); // pendiente hasta que el dueño cargue el USD
    expect((await adminProducts(db, base, FX)).find((a) => a.product.id === "storm-sobre")!.legacyPriceMinor).toBe(1_500_000);
    await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000, expectedVersion: 5 }), actor, 6);
    expect((await loadOverrides(db)).get("storm-sobre")!.priceMinor).toBe(1_500_000); // el dato anterior se conserva
  });

  it("el carrito detecta los cambios: precio (incluida la cotización), límite, agotado, pendiente y oculto", async () => {
    const v = async (id: string, qty: number, price: number, fx = FX) => evaluateCart([{ productId: id, quantity: qty, expectedPriceMinor: price }], applyOverrides(base, await loadOverrides(db), fx)).lines[0];
    expect((await v("storm-sobre", 1, 950_000)).status).toBe("ok");
    const a = await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000, maxPerOrder: 3 }), actor, 1_000);
    expect(await v("storm-sobre", 1, 950_000)).toMatchObject({ status: "price_changed", unitPriceMinor: 1_230_000, previousPriceMinor: 950_000 });
    expect((await v("storm-sobre", 1, 1_230_000)).status).toBe("ok");
    // El dólar cambia entre que se armó el carrito y la consulta: se avisa el nuevo precio.
    expect(await v("storm-sobre", 1, 1_230_000, { ...FX, rate10k: 13_000_000 })).toMatchObject({ status: "price_changed", unitPriceMinor: 1_300_000, previousPriceMinor: 1_230_000 });
    expect((await v("storm-sobre", 4, 1_230_000)).status).toBe("over_limit");
    const b = await saveProductChange(db, base, "storm-sobre", edit({ stock: 0, expectedVersion: a.version }), actor, 2_000);
    expect((await v("storm-sobre", 1, 1_230_000)).status).toBe("out_of_stock");
    const c = await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: null, stock: 5, expectedVersion: b.version }), actor, 3_000);
    expect((await v("storm-sobre", 1, 1_230_000)).status).toBe("pending_commercial");
    await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000, visible: false, expectedVersion: c.version }), actor, 4_000);
    expect((await v("storm-sobre", 1, 1_230_000)).status).toBe("unavailable");
  });

  it("rechaza una edición con versión vieja (otro cambio se guardó antes)", async () => {
    const a = await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000 }), actor, 1_000);
    await expect(saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 2000, expectedVersion: 0 }), actor, 2_000)).rejects.toThrow(AdminError);
    try { await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 2000, expectedVersion: 0 }), actor, 2_000); } catch (e) { expect((e as AdminError).status).toBe(409); }
    expect((await loadOverrides(db)).get("storm-sobre")!.priceUsdMinor).toBe(1000);
    expect(a.version).toBe(1_000);
  });

  it("producto inexistente → 404 y nada se guarda", async () => {
    await expect(saveProductChange(db, base, "no-existe", edit(), actor)).rejects.toThrow(/no existe/);
    expect((await loadOverrides(db)).size).toBe(0);
  });

  it("restablecer borra los valores del panel, vuelve al código y deja constancia", async () => {
    const a = await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000, stock: 1 }), actor, 1_000);
    await expect(resetProduct(db, base, "storm-sobre", 0, actor)).rejects.toThrow(AdminError); // versión vieja
    await resetProduct(db, base, "storm-sobre", a.version, actor, 2_000);
    expect((await view()).find((x) => x.id === "storm-sobre")).toMatchObject({ priceMinor: 950_000, stockQuantity: 24 });
    const last = (await listAudit(db, { productId: "storm-sobre" }))[0];
    expect(last.field).toBe("reset");
    expect(JSON.parse(last.oldValue)).toMatchObject({ priceUsdMinor: 1000, stockQuantity: 1 });
    expect(JSON.parse(last.newValue)).toMatchObject({ priceUsdMinor: null, stockQuantity: 24 });
    expect((await adminProducts(db, base, FX)).find((x) => x.product.id === "storm-sobre")).toMatchObject({ overridden: false, version: 0 });
  });

  it("las consultas históricas no cambian cuando cambia el precio ni la cotización (snapshot en la consulta)", async () => {
    const { createInquiry, getInquiryFor, hashToken } = await import("@/features/inquiries/service");
    await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 1000 }), actor, 500);
    const hash = hashToken("sesion-de-prueba-0123456789");
    const body = { items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: 1_230_000 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", idempotencyKey: "clave-de-prueba-0123456789" };
    const { inquiry } = await createInquiry(db, body, { sessionTokenHash: hash, fx: FX, products: applyOverrides(base, await loadOverrides(db), FX) });
    expect(inquiry.subtotalMinor).toBe(2_460_000);
    expect(inquiry.fx).toMatchObject({ rate10k: 12_340_000, mode: "manual" });
    expect(inquiry.lines[0]).toMatchObject({ unitPriceUsdMinor: 1000, unitPriceMinor: 1_230_000 });
    await saveProductChange(db, base, "storm-sobre", edit({ priceUsdMinor: 2000, expectedVersion: 500 }), actor, 1_000);
    const again = (await getInquiryFor(db, inquiry.reference, { sessionTokenHash: hash }))!;
    expect(again.subtotalMinor).toBe(2_460_000);
    expect(again.fx!.rate10k).toBe(12_340_000);
    expect(again.lines[0].unitPriceUsdMinor).toBe(1000);
  });
});

describe("validación de lo que envía el panel", () => {
  const ok = { priceUsdMinor: 1000, stock: 5, maxPerOrder: null, visible: true, expectedVersion: 0 };
  it("acepta valores válidos, vacíos (null) y campos omitidos", async () => {
    expect(ProductEditSchema.safeParse(ok).success).toBe(true);
    expect(ProductEditSchema.safeParse({ ...ok, priceUsdMinor: null, stock: null }).success).toBe(true);
    expect(ProductEditSchema.safeParse({ expectedVersion: 0 }).success).toBe(true);
  });
  it.each([
    [{ priceUsdMinor: 0 }], [{ priceUsdMinor: -5 }], [{ priceUsdMinor: 12.5 }], [{ priceUsdMinor: "1000" }], [{ priceUsdMinor: 1e9 }],
    [{ stock: -1 }], [{ stock: 1.5 }], [{ stock: "3" }], [{ maxPerOrder: 0 }], [{ maxPerOrder: 100 }], [{ visible: "si" }], [{ expectedVersion: -1 }],
    [{ title: "ab" }], [{ title: "x".repeat(161) }], [{ description: "corta" }], [{ orderOnly: "si" }],
  ])("rechaza %j", (patch) => {
    expect(ProductEditSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
});

describe("quién es administrador", () => {
  const user = (email: string, emailVerified = true) => ({ id: "x", name: "N", email, emailVerified });
  afterEach(async () => { delete process.env.ADMIN_EMAIL; });
  it("sin ADMIN_EMAIL nadie es administrador", async () => {
    const { isAdmin, adminConfigured } = await import("@/server/admin");
    delete process.env.ADMIN_EMAIL;
    expect(adminConfigured()).toBe(false);
    expect(isAdmin(user("dueno@example.com"))).toBe(false);
    process.env.ADMIN_EMAIL = "   ";
    expect(isAdmin(user("dueno@example.com"))).toBe(false);
    process.env.ADMIN_EMAIL = "no-es-un-correo";
    expect(adminConfigured()).toBe(false);
  });
  it("solo el correo configurado, verificado y sin importar mayúsculas", async () => {
    const { isAdmin } = await import("@/server/admin");
    process.env.ADMIN_EMAIL = "Dueno@Example.com";
    expect(isAdmin(user("dueno@example.com"))).toBe(true);
    expect(isAdmin(user("DUENO@example.com"))).toBe(true);
    expect(isAdmin(user("dueno@example.com", false))).toBe(false); // correo sin verificar
    expect(isAdmin(user("otro@example.com"))).toBe(false);
    expect(isAdmin(user("dueno@example.com.ar"))).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

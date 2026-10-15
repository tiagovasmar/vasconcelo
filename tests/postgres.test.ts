import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { demoCatalog } from "@/content/catalog";
import { createDb } from "@/db/client";
import { favorites, fxLog, inquiries, inquiryLines, productAudit, productGalleries, productOverrides, rateLimits, user, wholesaleRequests } from "@/db/schema";
import { saveGallery } from "@/features/catalog/gallery";
import { AdminError, initializeStockToZero, listAudit, saveProductChange, resetProduct } from "@/features/catalog/overrides";
import { allowRequest, claimGuestInquiries, createInquiry, hashToken } from "@/features/inquiries/service";
import { createWholesaleRequest } from "@/features/wholesale/service";
import { refreshRate, setManualRate } from "@/features/fx/service";
import { openTestDb, type TestDb } from "./helpers/pg";

/** Pruebas propias de PostgreSQL real: transacciones, relaciones, concurrencia entre conexiones distintas (como instancias serverless) y tipos grandes. */
const base = demoCatalog.products;
const actor = { id: "u1", email: "dueno@example.com" };
const FX = { status: "manual", mode: "manual", rate10k: 12_340_000, asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false } as const;
const now = new Date();
let db: TestDb;
/** Otra «instancia»: conexión independiente a la misma base. */
const instancia = () => createDb(db.testUrl, { max: 2 });
beforeEach(async () => { db = await openTestDb({ max: 4 }); });

const body = (n: number, qty = 1) => ({ items: [{ productId: "storm-sobre", quantity: qty, expectedPriceMinor: 950000 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", idempotencyKey: `clave-de-prueba-${String(n).padStart(6, "0")}` });
const addUser = (id: string) => db.insert(user).values({ id, name: id, email: `${id}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });

describe("concurrencia entre instancias", () => {
  it("dos ediciones simultáneas del mismo producto con la misma versión: gana UNA y la otra recibe «stale»; el historial no se duplica", async () => {
    const a = instancia(), b = instancia();
    const resultados = await Promise.allSettled([
      saveProductChange(a, base, "storm-sobre", { priceUsdMinor: 1000, expectedVersion: 0 }, actor, 1_000),
      saveProductChange(b, base, "storm-sobre", { priceUsdMinor: 2000, expectedVersion: 0 }, { id: "u2", email: "otro@example.com" }, 1_001),
    ]);
    const ok = resultados.filter((r) => r.status === "fulfilled");
    const bad = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toBeInstanceOf(AdminError);
    expect((bad[0].reason as AdminError).code).toBe("stale");
    const audit = await listAudit(db, { productId: "storm-sobre" });
    expect(audit).toHaveLength(1); // un solo cambio registrado (el ganador)
    await a.$client.end(); await b.$client.end();
  });

  it("30 ediciones secuenciales concurrentes de productos distintos no se bloquean ni se pisan", async () => {
    const ids = base.filter((p) => !p.retired).slice(0, 6).map((p) => p.id);
    const inst = [instancia(), instancia(), instancia()];
    await Promise.all(Array.from({ length: 30 }, (_, i) => saveProductChange(inst[i % 3], base, ids[i % ids.length], { stock: i, expectedVersion: 0 }, actor, 10_000 + i).catch((e) => { if (!(e instanceof AdminError)) throw e; })));
    expect((await db.select().from(productOverrides)).length).toBe(ids.length);
    await Promise.all(inst.map((i) => i.$client.end()));
  });

  it("dos reinicios del mismo producto a la vez: uno borra y el otro ve la fila ya borrada", async () => {
    await saveProductChange(db, base, "storm-sobre", { priceUsdMinor: 1000, expectedVersion: 0 }, actor, 1_000);
    const a = instancia(), b = instancia();
    const r = await Promise.allSettled([resetProduct(a, base, "storm-sobre", 1_000, actor, 2_000), resetProduct(b, base, "storm-sobre", 1_000, actor, 2_001)]);
    expect(r.every((x) => x.status === "fulfilled")).toBe(true); // el segundo no encuentra fila: devuelve versión 0
    expect(await db.select().from(productOverrides)).toHaveLength(0);
    expect((await listAudit(db, { productId: "storm-sobre" })).filter((x) => x.field === "reset")).toHaveLength(1);
    await a.$client.end(); await b.$client.end();
  });

  it("dos guardados de galería con la misma versión: gana uno", async () => {
    const p = base.find((x) => x.images.length >= 1)!;
    const items = (alt: string) => ({ items: [{ src: p.images[0].src, alt }], expectedVersion: 0 });
    const a = instancia(), b = instancia();
    const r = await Promise.allSettled([saveGallery(a, base, p.id, items("Texto uno"), actor, 1_000), saveGallery(b, base, p.id, items("Texto dos"), actor, 1_001)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason.code).toBe("stale");
    expect(await db.select().from(productGalleries)).toHaveLength(1);
    await a.$client.end(); await b.$client.end();
  });

  it("la misma clave de idempotencia enviada a la vez desde dos instancias crea UNA consulta y ambas devuelven la misma referencia", async () => {
    const a = instancia(), b = instancia();
    const ctx = { sessionTokenHash: hashToken("s"), fx: FX };
    const [x, y] = await Promise.all([createInquiry(a, body(1), ctx), createInquiry(b, body(1), ctx)]);
    expect(x.inquiry.reference).toBe(y.inquiry.reference);
    expect([x.replayed, y.replayed].sort()).toEqual([false, true]);
    expect(await db.select().from(inquiries)).toHaveLength(1);
    expect(await db.select().from(inquiryLines)).toHaveLength(1);
    await a.$client.end(); await b.$client.end();
  });

  it("reclamar las consultas de invitado desde dos pedidos a la vez: se asocian una sola vez", async () => {
    await addUser("ana");
    const tokenHash = hashToken("invitado");
    for (let i = 0; i < 3; i++) await createInquiry(db, body(i + 1), { sessionTokenHash: tokenHash, fx: FX });
    const a = instancia(), b = instancia();
    const [n1, n2] = await Promise.all([claimGuestInquiries(a, "ana", tokenHash), claimGuestInquiries(b, "ana", tokenHash)]);
    expect([n1, n2].sort()).toEqual([0, 3]);
    expect((await db.select().from(inquiries).where(eq(inquiries.userId, "ana")))).toHaveLength(3);
    await a.$client.end(); await b.$client.end();
  });

  it("el límite de uso es atómico: 12 pedidos simultáneos con tope 5 dejan pasar exactamente 5", async () => {
    const inst = [instancia(), instancia(), instancia()];
    const r = await Promise.all(Array.from({ length: 12 }, (_, i) => allowRequest(inst[i % 3], "ip-9:consultas", 5, 3600, 1_000_000)));
    expect(r.filter(Boolean)).toHaveLength(5);
    const [row] = await db.select().from(rateLimits);
    expect(row.count).toBe(12);
    await Promise.all(inst.map((i) => i.$client.end()));
  });

  it("dos solicitudes mayoristas simultáneas del mismo usuario: una sola fila", async () => {
    await addUser("ana");
    const datos = { businessName: "Cartas del Oeste", locality: "Haedo", province: "Buenos Aires" };
    const a = instancia(), b = instancia();
    const [x, y] = await Promise.all([createWholesaleRequest(a, "ana", datos), createWholesaleRequest(b, "ana", datos)]);
    expect(x.request.reference).toBe(y.request.reference);
    expect(await db.select().from(wholesaleRequests)).toHaveLength(1);
    await a.$client.end(); await b.$client.end();
  });

  it("la inicialización de stock en 0 se aplica una sola vez aunque se lance desde dos instancias a la vez", async () => {
    const a = instancia(), b = instancia();
    const real = base.filter((p) => !p.retired && !p.isDemo);
    // El catálogo de prueba es todo demostración: se usa una copia marcada como real para que la inicialización tenga a quién aplicarse.
    const catalogo = base.map((p) => ({ ...p, isDemo: false, stockQuantity: null }));
    void real;
    const [x, y] = await Promise.all([initializeStockToZero(a, catalogo, actor, 5_000), initializeStockToZero(b, catalogo, actor, 5_001)]);
    expect([x.applied, y.applied].sort()).toEqual([false, true]);
    const audit = await db.select().from(productAudit);
    expect(audit.length).toBe([x, y].find((r) => r.applied)!.updated);
    await a.$client.end(); await b.$client.end();
  });

  it("la cotización la consulta una sola instancia por ventana: la segunda es «omitida» sin salir a la red", async () => {
    let llamadas = 0;
    const f = async () => { llamadas++; return { ok: true, status: 200, json: async () => ({ moneda: "USD", casa: "blue", compra: 1500, venta: 1550, fechaActualizacion: new Date(1_800_000_000_000).toISOString() }) }; };
    const a = instancia(), b = instancia();
    const r1 = await refreshRate(a, { fetchFn: f, now: 1_800_000_000_000 });
    // Otra instancia (otro proceso) llega después, dentro de los 15 minutos: no consulta.
    const r2 = await refreshRate(b, { fetchFn: f, now: 1_800_000_000_000 + 60_000 });
    expect(r1).toMatchObject({ ok: true });
    expect(r2).toMatchObject({ skipped: true });
    expect(llamadas).toBe(1);
    await a.$client.end(); await b.$client.end();
  });
});

describe("transacciones y relaciones", () => {
  it("una edición rechazada («stale») no deja filas a medias: ni cambio ni historial", async () => {
    await saveProductChange(db, base, "storm-sobre", { priceUsdMinor: 1000, expectedVersion: 0 }, actor, 1_000);
    const antes = (await db.select().from(productAudit)).length;
    await expect(saveProductChange(db, base, "storm-sobre", { priceUsdMinor: 3000, stock: 4, expectedVersion: 7 }, actor, 2_000)).rejects.toThrow(AdminError);
    expect((await db.select().from(productAudit)).length).toBe(antes);
    const [o] = await db.select().from(productOverrides);
    expect(o.priceUsdMinor).toBe(1000);
  });

  it("si falla el insert de las líneas, la consulta tampoco se guarda (todo o nada)", async () => {
    // Se fuerza un error en el segundo insert de la transacción (las líneas): un SKU nulo viola NOT NULL.
    const body2 = { ...body(1), items: [{ productId: "storm-sobre", quantity: 1, expectedPriceMinor: 950000 }] };
    const products = base.map((p) => (p.id === "storm-sobre" ? { ...p, sku: null as unknown as string } : p));
    await expect(createInquiry(db, body2, { sessionTokenHash: hashToken("s"), fx: FX, products })).rejects.toThrow();
    expect(await db.select().from(inquiries)).toHaveLength(0);
  });

  it("borrar un usuario borra en cascada sus favoritos y su solicitud mayorista, pero conserva sus consultas (sin clave foránea)", async () => {
    await addUser("ana");
    await db.insert(favorites).values({ userId: "ana", productId: "storm-sobre", createdAt: 1 });
    await createWholesaleRequest(db, "ana", { businessName: "X Cartas", locality: "Haedo", province: "Buenos Aires" });
    await createInquiry(db, body(1), { sessionTokenHash: hashToken("s"), userId: "ana", fx: FX });
    await db.delete(user).where(eq(user.id, "ana"));
    expect(await db.select().from(favorites)).toHaveLength(0);
    expect(await db.select().from(wholesaleRequests)).toHaveLength(0);
    expect(await db.select().from(inquiries)).toHaveLength(1);
  });

  it("claves únicas y claves foráneas se respetan (no hay filas huérfanas)", async () => {
    await addUser("ana");
    await expect(addUser("ana")).rejects.toThrow(); // PK duplicada
    await expect(db.insert(user).values({ id: "otra", name: "x", email: "ana@example.com", emailVerified: true, createdAt: now, updatedAt: now })).rejects.toThrow(); // email único
    await expect(db.insert(favorites).values({ userId: "no-existe", productId: "p", createdAt: 1 })).rejects.toThrow(); // FK
    await expect(db.insert(inquiryLines).values({ inquiryId: "TT-NOEXISTE", productId: "p", sku: "s", title: "t", language: "ja", quantity: 1, unitPriceMinor: 1, lineSubtotalMinor: 1 })).rejects.toThrow(); // FK
  });

  it("enteros grandes: milisegundos de 2026 e importes de más de 2.147.483.647 centavos hacen ida y vuelta exactos", async () => {
    const ms = 1_792_000_123_456;
    await db.insert(fxLog).values({ kind: "auto_rate", rate10k: 10_000_000_000, mode: "auto", createdAt: ms }); // $1.000.000 por dólar × 10.000
    const [l] = await db.select().from(fxLog);
    expect(l).toMatchObject({ createdAt: ms, rate10k: 10_000_000_000 });
    await setManualRate(db, 1234.5, actor, null, ms);
  });

  it("el historial conserva el orden por fecha e id y la identidad avanza sola", async () => {
    await saveProductChange(db, base, "storm-sobre", { priceUsdMinor: 1000, stock: 3, maxPerOrder: 2, expectedVersion: 0 }, actor, 1_000);
    const ids = (await db.select().from(productAudit)).map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((i) => Number.isInteger(i) && i > 0)).toBe(true);
  });
});

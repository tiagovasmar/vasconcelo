import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { demoCatalog } from "@/content/catalog";
import { createDb } from "@/db/client";
import { productAudit, productOverrides, saleLines, sales, stockMovements } from "@/db/schema";
import { loadOverrides, saveProductChange } from "@/features/catalog/overrides";
import { createInquiry, hashToken } from "@/features/inquiries/service";
import { accountingOverview, registerExpense } from "@/features/contabilidad/service";
import { listMovements, listSales, moveStock, previewSale, registerSale, SaleError, voidSale } from "@/features/sales/service";
import type { EffectiveRate } from "@/features/fx/convert";
import { openTestDb, type TestDb } from "./helpers/pg";

/** Ventas manuales y movimientos de stock contra un PostgreSQL real: descuento único, atomicidad, concurrencia, precios congelados e historial inmutable. */
let current: { id: string; name: string; email: string; emailVerified: boolean } | null = null;
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/server/session", () => ({ getUser: async () => current, userFromRequest: async () => current }));

const base = demoCatalog.products;
const actor = { id: "u1", email: "dueno@example.com" };
const FX: EffectiveRate = { status: "manual", mode: "manual", rate10k: 12_340_000, asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false };
let db: TestDb;
let n = 0;
const key = () => `venta-de-prueba-${String(++n).padStart(8, "0")}`;
const peso = (p: number) => p * 100;
const sale = (items: Array<{ productId: string; quantity: number; price: number }>, over: Record<string, unknown> = {}) => ({
  items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPriceMinor: peso(i.price) })), paymentMethod: "efectivo", idempotencyKey: key(), ...over,
});
const stockOf = async (id: string) => (await loadOverrides(db)).get(id)?.stockQuantity ?? base.find((p) => p.id === id)!.stockQuantity;
const reg = (body: unknown, extra: { fx?: EffectiveRate } = {}) => registerSale(db, body, actor, { fx: FX, ...extra });
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (e instanceof SaleError) return e.code; throw e; } throw new Error("se esperaba un error"); };
const counts = async () => ({ sales: (await db.select().from(sales)).length, lines: (await db.select().from(saleLines)).length, moves: (await db.select().from(stockMovements)).length });

beforeEach(async () => { db = await openTestDb(); });

describe("registrar una venta", () => {
  it("descuenta el stock una sola vez y deja venta, líneas, movimiento e historial de cambios", async () => {
    const antes = (await stockOf("storm-sobre"))!;
    const { sale: s, replayed } = await reg(sale([{ productId: "storm-sobre", quantity: 3, price: 9000 }], { note: "En persona" }));
    expect(replayed).toBe(false);
    expect(s).toMatchObject({ status: "registrada", paymentMethod: "efectivo", note: "En persona", totalMinor: peso(27000), createdByEmail: "dueno@example.com" });
    expect(s.id).toMatch(/^VT-[A-Z2-9]{8}$/);
    expect(await stockOf("storm-sobre")).toBe(antes - 3);
    const mov = await listMovements(db);
    expect(mov).toHaveLength(1);
    expect(mov[0]).toMatchObject({ kind: "venta", delta: -3, stockBefore: antes, stockAfter: antes - 3, saleId: s.id, userEmail: "dueno@example.com" });
    const audit = (await db.select().from(productAudit)).filter((a) => a.field === "stock_quantity");
    expect(audit).toHaveLength(1);
    expect(audit[0].userEmail).toContain(s.id);
  });

  it("registra una venta externa en cuotas con fecha y neto, y cuenta el gasto una sola vez", async () => {
    const before = await stockOf("storm-sobre");
    const body = sale([{ productId: "storm-sobre", quantity: 2, price: 9000 }], {
      paymentMethod: "tarjeta-cuotas", soldOn: "2026-11-01", receivedMinor: peso(16500), installments: 3,
    });
    const { sale: saved } = await reg(body);
    expect(saved).toMatchObject({ soldOn: "2026-11-01", totalMinor: peso(18000), receivedMinor: peso(16500), installments: 3 });
    expect((await reg(body)).replayed).toBe(true);
    expect(await stockOf("storm-sobre")).toBe(before! - 2);
    expect(await code(reg({ ...body, receivedMinor: peso(16000) }))).toBe("idempotency_conflict");
    const expense = { idempotencyKey: key(), spentAt: Date.parse("2026-11-01T15:00:00Z"), amountMinor: peso(1500), description: "Envío", paymentMethod: "transferencia" };
    expect(await registerExpense(db, expense, actor.email)).toEqual({ replayed: false });
    expect(await registerExpense(db, expense, actor.email)).toEqual({ replayed: true });
    expect(await accountingOverview(db)).toMatchObject({ gross: peso(18000), net: peso(16500), spent: peso(1500), pending: 0 });
    const day = { from: "2026-11-01", to: "2026-11-01" };
    expect(await accountingOverview(db, day)).toMatchObject({ gross: peso(18000), net: peso(16500), spent: peso(1500), billing: [{ day: "2026-11-01", total: peso(18000) }] });
    expect((await listSales(db, 30, day)).map((entry) => entry.id)).toEqual([saved.id]);
    const later = { from: "2026-11-02", to: "2026-11-02" };
    expect(await accountingOverview(db, later)).toMatchObject({ gross: 0, net: 0, spent: 0, expenses: [] });
    expect(await listSales(db, 30, later)).toEqual([]);
    await voidSale(db, saved.id, "Registro duplicado", actor);
    expect(await stockOf("storm-sobre")).toBe(before);
    expect(await accountingOverview(db)).toMatchObject({ gross: 0, net: 0, spent: peso(1500) });
  });

  it("rechaza datos incompletos de tarjeta sin descontar stock", async () => {
    const before = await stockOf("storm-sobre");
    const body = sale([{ productId: "storm-sobre", quantity: 1, price: 9000 }]);
    expect(await code(reg({ ...body, paymentMethod: "tarjeta" }))).toBe("invalid_input");
    expect(await code(reg({ ...body, paymentMethod: "tarjeta-cuotas", receivedMinor: peso(8000) }))).toBe("invalid_input");
    expect(await code(reg({ ...body, paymentMethod: "tarjeta", receivedMinor: peso(9500) }))).toBe("invalid_input");
    expect(await stockOf("storm-sobre")).toBe(before);
  });

  it("conserva el precio realmente cobrado aunque después cambien el catálogo y la cotización", async () => {
    await saveProductChange(db, base, "storm-sobre", { priceUsdMinor: 1000, expectedVersion: 0 }, actor);
    const { sale: s } = await reg(sale([{ productId: "storm-sobre", quantity: 1, price: 11000 }]));
    expect(s.lines[0]).toMatchObject({ unitPriceMinor: peso(11000), catalogPriceUsdMinor: 1000 });
    // El catálogo sube y la cotización cambia: lo cobrado no se toca.
    const v = (await loadOverrides(db)).get("storm-sobre")!.updatedAt;
    await saveProductChange(db, base, "storm-sobre", { priceUsdMinor: 5000, expectedVersion: v }, actor);
    const [row] = await listSales(db);
    expect(row.lines[0].unitPriceMinor).toBe(peso(11000));
    expect(row.totalMinor).toBe(peso(11000));
  });

  it("no vende más de lo que hay ni deja stock negativo, y un fallo en la segunda línea no deja nada a medias", async () => {
    const stockCaja = (await stockOf("storm-caja"))!;
    const antes = (await stockOf("storm-sobre"))!;
    const code1 = await code(reg(sale([{ productId: "storm-sobre", quantity: 1, price: 9000 }, { productId: "storm-caja", quantity: stockCaja + 1, price: 18000 }])));
    expect(code1).toBe("insufficient_stock");
    expect(await counts()).toEqual({ sales: 0, lines: 0, moves: 0 });
    expect(await stockOf("storm-sobre")).toBe(antes); // la primera línea se revirtió
    expect(await stockOf("storm-caja")).toBe(stockCaja);
    expect((await db.select().from(productAudit)).filter((a) => a.field === "stock_quantity")).toHaveLength(0);
    // Justo lo que hay sí se puede vender: queda en 0, nunca negativo.
    await reg(sale([{ productId: "storm-caja", quantity: stockCaja, price: 18000 }]));
    expect(await stockOf("storm-caja")).toBe(0);
    expect(await code(reg(sale([{ productId: "storm-caja", quantity: 1, price: 18000 }])))).toBe("insufficient_stock");
  });

  it("stock pendiente: no se vende hasta cargarlo", async () => {
    await saveProductChange(db, base, "storm-sobre", { stock: null, expectedVersion: 0 }, actor);
    expect(await code(reg(sale([{ productId: "storm-sobre", quantity: 1, price: 9000 }])))).toBe("stock_pending");
    const p = await previewSale(db, sale([{ productId: "storm-sobre", quantity: 1, price: 9000 }]));
    expect(p.ok).toBe(false);
    expect(p.lines[0].problem).toMatch(/pendiente/);
  });

  it("el doble clic o el reintento con la misma clave devuelven la misma venta y descuentan una sola vez", async () => {
    const antes = (await stockOf("storm-sobre"))!;
    const body = sale([{ productId: "storm-sobre", quantity: 2, price: 9000 }], { idempotencyKey: "clave-doble-clic-0001" });
    const a = await reg(body);
    const b = await reg(body);
    expect(b.replayed).toBe(true);
    expect(b.sale.id).toBe(a.sale.id);
    expect(await stockOf("storm-sobre")).toBe(antes - 2);
    expect(await counts()).toEqual({ sales: 1, lines: 1, moves: 1 });
    // La misma clave con otro contenido no se reutiliza.
    expect(await code(reg(sale([{ productId: "storm-sobre", quantity: 5, price: 9000 }], { idempotencyKey: "clave-doble-clic-0001" })))).toBe("idempotency_conflict");
    expect(await stockOf("storm-sobre")).toBe(antes - 2);
  });

  it("dos instancias enviando la misma venta a la vez crean UNA sola y descuentan una vez", async () => {
    const other = createDb(db.testUrl, { max: 1 });
    try {
      const antes = (await stockOf("storm-sobre"))!;
      const body = sale([{ productId: "storm-sobre", quantity: 4, price: 9000 }], { idempotencyKey: "clave-concurrente-01" });
      const [x, y] = await Promise.all([registerSale(db, body, actor, { fx: FX }), registerSale(other, body, actor, { fx: FX })]);
      expect(x.sale.id).toBe(y.sale.id);
      expect([x.replayed, y.replayed].sort()).toEqual([false, true]);
      expect(await stockOf("storm-sobre")).toBe(antes - 4);
      expect(await counts()).toEqual({ sales: 1, lines: 1, moves: 1 });
    } finally {
      await other.$client.end({ timeout: 2 });
    }
  });

  it("dos ventas distintas simultáneas por más de lo que hay: una sola se concreta", async () => {
    const other = createDb(db.testUrl, { max: 1 });
    try {
      await saveProductChange(db, base, "storm-sobre", { stock: 5, expectedVersion: 0 }, actor);
      const r = await Promise.allSettled([reg(sale([{ productId: "storm-sobre", quantity: 3, price: 9000 }])), registerSale(other, sale([{ productId: "storm-sobre", quantity: 3, price: 9000 }]), actor, { fx: FX })]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const rej = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
      expect((rej.reason as SaleError).code).toBe("insufficient_stock");
      expect(await stockOf("storm-sobre")).toBe(2);
    } finally {
      await other.$client.end({ timeout: 2 });
    }
  });

  it("valida cantidades, precios, método de pago y productos repetidos", async () => {
    const mal = async (over: Record<string, unknown>) => code(reg({ ...sale([{ productId: "storm-sobre", quantity: 1, price: 9000 }]), ...over }));
    expect(await mal({ items: [{ productId: "storm-sobre", quantity: 0, unitPriceMinor: peso(9000) }] })).toBe("invalid_input");
    expect(await mal({ items: [{ productId: "storm-sobre", quantity: 1.5, unitPriceMinor: peso(9000) }] })).toBe("invalid_input");
    expect(await mal({ items: [{ productId: "storm-sobre", quantity: 1, unitPriceMinor: 950050 }] })).toBe("invalid_input"); // no es un peso entero
    expect(await mal({ items: [{ productId: "storm-sobre", quantity: 1, unitPriceMinor: 0 }] })).toBe("invalid_input");
    expect(await mal({ paymentMethod: "coordinar" })).toBe("invalid_input"); // la opción eliminada
    expect(await mal({ paymentMethod: "" })).toBe("invalid_input");
    expect(await mal({ items: [] })).toBe("invalid_input");
    expect(await mal({ items: [{ productId: "storm-sobre", quantity: 1, unitPriceMinor: peso(9000) }, { productId: "storm-sobre", quantity: 1, unitPriceMinor: peso(9000) }] })).toBe("invalid_input");
    expect(await mal({ items: [{ productId: "no-existe", quantity: 1, unitPriceMinor: peso(9000) }] })).toBe("not_found");
    expect(await mal({ idempotencyKey: "corta" })).toBe("invalid_input");
    expect(await counts()).toEqual({ sales: 0, lines: 0, moves: 0 });
  });

  it("una consulta por WhatsApp o un carrito armado no descuentan stock ni crean ventas", async () => {
    const antes = (await stockOf("storm-sobre"))!;
    await createInquiry(db, { items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: 950000 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: "consulta-no-descuenta-1" }, { sessionTokenHash: hashToken("s") });
    expect(await stockOf("storm-sobre")).toBe(antes);
    expect(await counts()).toEqual({ sales: 0, lines: 0, moves: 0 });
  });
});

describe("anular una venta", () => {
  it("devuelve el stock una sola vez, conserva la venta como anulada y deja el motivo", async () => {
    const antes = (await stockOf("storm-sobre"))!;
    const { sale: s } = await reg(sale([{ productId: "storm-sobre", quantity: 3, price: 9000 }]));
    const v = await voidSale(db, s.id, "Error de carga: era otra cantidad", actor);
    expect(v).toMatchObject({ status: "anulada", voidReason: "Error de carga: era otra cantidad", voidedByEmail: "dueno@example.com" });
    expect(await stockOf("storm-sobre")).toBe(antes);
    expect(await code(voidSale(db, s.id, "otra vez por las dudas", actor))).toBe("already_voided");
    expect(await stockOf("storm-sobre")).toBe(antes);
    const tipos = (await listMovements(db)).map((m) => m.kind).sort();
    expect(tipos).toEqual(["anulacion", "venta"]);
    expect((await listSales(db))[0].lines).toHaveLength(1); // la venta original sigue ahí
    expect(await code(voidSale(db, s.id, "x", actor))).toBe("invalid_input"); // el motivo es obligatorio
  });
});

describe("entradas y ajustes de stock", () => {
  it("la entrada suma y el ajuste fija; los dos exigen motivo y quedan con responsable", async () => {
    const antes = (await stockOf("storm-sobre"))!;
    const e = await moveStock(db, { kind: "entrada", productId: "storm-sobre", quantity: 10, reason: "Compra al proveedor", idempotencyKey: key() }, actor);
    expect(e).toMatchObject({ stockBefore: antes, stockAfter: antes + 10, replayed: false });
    const a = await moveStock(db, { kind: "ajuste", productId: "storm-sobre", newQuantity: 4, reason: "Conteo físico", idempotencyKey: key() }, actor);
    expect(a).toMatchObject({ stockBefore: antes + 10, stockAfter: 4 });
    expect(await stockOf("storm-sobre")).toBe(4);
    const mov = await listMovements(db);
    expect(mov.map((m) => [m.kind, m.delta])).toEqual([["ajuste", 4 - (antes + 10)], ["entrada", 10]]);
    expect(mov[0].reason).toContain("Conteo físico");
    expect(mov.every((m) => m.userEmail === "dueno@example.com")).toBe(true);
    expect(await code(moveStock(db, { kind: "entrada", productId: "storm-sobre", quantity: 1, reason: "", idempotencyKey: key() }, actor))).toBe("invalid_input");
    expect(await code(moveStock(db, { kind: "ajuste", productId: "storm-sobre", newQuantity: -1, reason: "Conteo", idempotencyKey: key() }, actor))).toBe("invalid_input");
    expect(await code(moveStock(db, { kind: "ajuste", productId: "storm-sobre", newQuantity: 4, reason: "Mismo valor", idempotencyKey: key() }, actor))).toBe("invalid_input");
  });

  it("repetir la misma operación (doble clic) no suma dos veces", async () => {
    const antes = (await stockOf("storm-sobre"))!;
    const body = { kind: "entrada", productId: "storm-sobre", quantity: 5, reason: "Reposición", idempotencyKey: "entrada-doble-clic-001" };
    const a = await moveStock(db, body, actor);
    const b = await moveStock(db, body, actor);
    expect(b.replayed).toBe(true);
    expect(await stockOf("storm-sobre")).toBe(antes + 5);
    expect((await listMovements(db)).filter((m) => m.kind === "entrada")).toHaveLength(1);
    expect(a.stockAfter).toBe(b.stockAfter);
  });

  it("editar el stock desde Productos también queda como movimiento (ajuste) con su motivo", async () => {
    await saveProductChange(db, base, "storm-sobre", { stock: 9, stockReason: "Recuento de góndola", expectedVersion: 0 }, actor);
    const [m] = await listMovements(db);
    expect(m).toMatchObject({ kind: "ajuste", stockAfter: 9, userEmail: "dueno@example.com" });
    expect(m.reason).toBe("Recuento de góndola");
    const v = (await loadOverrides(db)).get("storm-sobre")!.updatedAt;
    await saveProductChange(db, base, "storm-sobre", { stock: 12, expectedVersion: v }, actor);
    expect((await listMovements(db))[0].reason).toBe("Edición directa en Productos");
  });

  it("un producto «solo por encargo» no puede recibir stock por esta vía", async () => {
    await saveProductChange(db, base, "storm-sobre", { orderOnly: true, stock: 0, expectedVersion: 0 }, actor);
    expect(await code(moveStock(db, { kind: "entrada", productId: "storm-sobre", quantity: 2, reason: "Prueba", idempotencyKey: key() }, actor))).toBe("order_only");
  });
});

describe("el historial no se puede editar ni borrar (lo impide la base)", () => {
  it("ventas, líneas y movimientos rechazan UPDATE y DELETE; el stock negativo también", async () => {
    const { sale: s } = await reg(sale([{ productId: "storm-sobre", quantity: 1, price: 9000 }]));
    const ejecuta = async (q: ReturnType<typeof sql>) => { try { await db.execute(q); return "ok"; } catch (e) { return String((e as Error).cause ?? e) + String(e); } };
    expect(await ejecuta(sql`update sales set total_minor = 1 where id = ${s.id}`)).toMatch(/no se edita/);
    expect(await ejecuta(sql`update sales set status = 'registrada', void_reason = 'x' where id = ${s.id}`)).toMatch(/no se edita/);
    expect(await ejecuta(sql`delete from sales where id = ${s.id}`)).toMatch(/no se borra/);
    expect(await ejecuta(sql`update sale_lines set quantity = 99 where sale_id = ${s.id}`)).toMatch(/no se edita ni se borra/);
    expect(await ejecuta(sql`delete from sale_lines where sale_id = ${s.id}`)).toMatch(/no se edita ni se borra/);
    expect(await ejecuta(sql`update stock_movements set delta = 100`)).toMatch(/no se edita ni se borra/);
    expect(await ejecuta(sql`delete from stock_movements`)).toMatch(/no se edita ni se borra/);
    expect(await ejecuta(sql`update product_overrides set stock_quantity = -1 where product_id = 'storm-sobre'`)).toMatch(/stock_check|check/i);
    expect(await ejecuta(sql`insert into stock_movements (product_id, sku, title, kind, delta, stock_after, reason, user_id, user_email, created_at) values ('x','x','x','venta',-1,-1,'x','u','e',1)`)).toMatch(/stock_movements_after_check|check/i);
    expect((await db.select().from(sales).where(eq(sales.id, s.id)))[0].totalMinor).toBe(peso(9000));
    expect((await db.select().from(productOverrides).where(eq(productOverrides.productId, "storm-sobre")))[0].stockQuantity).toBeGreaterThanOrEqual(0);
  });
});

describe("las rutas del panel exigen ser el administrador", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, { DATABASE_URL: db.testUrl, ADMIN_EMAIL: "dueno@example.com" });
    (globalThis as Record<string, unknown>).__tiendaDb = undefined;
    current = null;
  });
  afterEach(async () => {
    const g = globalThis as { __tiendaDb?: { $client: { end: (o?: object) => Promise<void> } } };
    await g.__tiendaDb?.$client.end({ timeout: 2 }).catch(() => undefined);
    g.__tiendaDb = undefined;
    process.env = { ...saved };
  });
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const url = new URL(path, "http://localhost:3000");
    const mod = path === "/api/admin/ventas" ? await import("@/app/api/admin/ventas/route") : path === "/api/admin/ventas/previsualizar" ? await import("@/app/api/admin/ventas/previsualizar/route") : await import("@/app/api/admin/stock/route");
    return mod.POST(new Request(url, { method: "POST", body: JSON.stringify(body), headers: { host: "localhost:3000", "content-type": "application/json", ...headers } }));
  };
  const rutas: Array<[string, unknown]> = [
    ["/api/admin/ventas", sale([{ productId: "storm-sobre", quantity: 1, price: 9000 }])],
    ["/api/admin/ventas/previsualizar", sale([{ productId: "storm-sobre", quantity: 1, price: 9000 }])],
    ["/api/admin/stock", { kind: "entrada", productId: "storm-sobre", quantity: 1, reason: "Prueba", idempotencyKey: "ruta-stock-prueba-0001" }],
  ];
  it("sin sesión 401, sin ser el dueño 403, correo sin confirmar 403, otro origen 403; no se escribe nada", async () => {
    for (const [path, body] of rutas) {
      expect((await post(path, body)).status, path).toBe(401);
      current = { id: "u2", name: "Cliente", email: "cliente@example.com", emailVerified: true };
      expect((await post(path, body)).status, path).toBe(403);
      current = { id: "u1", name: "Dueño", email: "dueno@example.com", emailVerified: false };
      expect((await post(path, body)).status, path).toBe(403);
      current = { id: "u1", name: "Dueño", email: "dueno@example.com", emailVerified: true };
      expect((await post(path, body, { origin: "https://sitio-malicioso.example" })).status, path).toBe(403);
      current = null;
    }
    expect(await counts()).toEqual({ sales: 0, lines: 0, moves: 0 });
  });
  it("el dueño registra la venta por la ruta; repetir la misma petición no la duplica; la anulación también exige ser el dueño", async () => {
    current = { id: "u1", name: "Dueño", email: "dueno@example.com", emailVerified: true };
    const body = sale([{ productId: "storm-sobre", quantity: 2, price: 9000 }], { idempotencyKey: "ruta-venta-prueba-0001" });
    const r1 = await post("/api/admin/ventas", body);
    const r2 = await post("/api/admin/ventas", body);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const j1 = (await r1.json()) as { sale: { id: string }; replayed: boolean };
    const j2 = (await r2.json()) as { sale: { id: string }; replayed: boolean };
    expect(j2.sale.id).toBe(j1.sale.id);
    expect(j2.replayed).toBe(true);
    expect(await counts()).toEqual({ sales: 1, lines: 1, moves: 1 });
    const { POST } = await import("@/app/api/admin/ventas/[id]/anular/route");
    const anular = (hdr: Record<string, string> = {}) => POST(new Request("http://localhost:3000/x", { method: "POST", body: JSON.stringify({ reason: "Error de carga del vendedor" }), headers: { host: "localhost:3000", "content-type": "application/json", ...hdr } }), { params: Promise.resolve({ id: j1.sale.id }) });
    current = { id: "u2", name: "Cliente", email: "cliente@example.com", emailVerified: true };
    expect((await anular()).status).toBe(403);
    current = { id: "u1", name: "Dueño", email: "dueno@example.com", emailVerified: true };
    expect((await anular()).status).toBe(200);
    expect((await anular()).status).toBe(409);
  });
  it("un mensaje de error de negocio sale en español y con su código", async () => {
    current = { id: "u1", name: "Dueño", email: "dueno@example.com", emailVerified: true };
    const res = await post("/api/admin/ventas", sale([{ productId: "storm-sobre", quantity: 99999 % 999 + 500, price: 9000 }]));
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe("insufficient_stock");
    expect(j.error.message).toMatch(/Stock insuficiente/);
  });
});

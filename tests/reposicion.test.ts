import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { inquiries, notificationOutbox, productOverrides, restockAlerts, sales, user } from "@/db/schema";
import { cancelRestock, hasActiveAlert, listUserAlerts, notifyRestock, RESTOCK_CONSENT_TEXT, subscribeRestock, waitingCounts } from "@/features/avisos/reposicion";
import { flushOutbox } from "@/features/avisos/outbox";
import { SaleError } from "@/features/sales/errors";
import type { Mail } from "@/server/mail";

/** «Avisame cuando vuelva»: registro de interés (no es una consulta ni una venta), sin duplicados, cancelable y con consentimiento. Producto agotado de prueba: parcial-bundle (stock 0). */
let db: Db;
const actor = { id: "admin-1", email: "dueno@example.com" };
const d = new Date();
const guest = { userId: null, accountEmail: null, emailVerified: false };
const account = (id: string, verified = true) => ({ userId: id, accountEmail: `${id}@example.com`, emailVerified: verified });
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (e instanceof SaleError) return e.code; throw e; } throw new Error("se esperaba un error"); };
const AGOTADO = "parcial-bundle";

beforeEach(async () => {
  db = await openTestDb({ max: 4 });
  await db.insert(user).values([{ id: "ana", name: "Ana", email: "ana@example.com", emailVerified: true, createdAt: d, updatedAt: d }, { id: "beto", name: "Beto", email: "beto@example.com", emailVerified: false, createdAt: d, updatedAt: d }]);
});

describe("anotarse", () => {
  it("exige el consentimiento expreso y guarda el texto aceptado", async () => {
    expect(await code(subscribeRestock(db, { productId: AGOTADO, email: "x@y.com" }, guest))).toBe("invalid_input");
    expect(await code(subscribeRestock(db, { productId: AGOTADO, consent: false, email: "x@y.com" }, guest))).toBe("invalid_input");
    const r = await subscribeRestock(db, { productId: AGOTADO, consent: true, email: "  Visitante@Correo.COM " }, guest, 1000);
    const [row] = await db.select().from(restockAlerts);
    expect(row).toMatchObject({ email: "visitante@correo.com", consentAt: 1000, consentText: RESTOCK_CONSENT_TEXT, status: "activo", productId: AGOTADO });
    expect(r.cancelToken).toBeTruthy();
    expect(row.cancelTokenHash).not.toBe(r.cancelToken); // solo se guarda el hash del enlace secreto
  });

  it("evita duplicados (incluso en simultáneo) y con cuenta usa SIEMPRE el correo verificado de la cuenta", async () => {
    const body = { productId: AGOTADO, consent: true as const };
    const rs = await Promise.all([1, 2, 3].map(() => subscribeRestock(db, { ...body, email: "otro@correo.com" }, account("ana"))));
    expect(rs.filter((r) => !r.replayed)).toHaveLength(1);
    const rows = await db.select().from(restockAlerts);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("ana@example.com"); // el correo que manda el navegador se ignora
    expect(await code(subscribeRestock(db, body, account("beto", false)))).toBe("forbidden"); // correo sin confirmar
    expect(await code(subscribeRestock(db, body, guest))).toBe("invalid_input"); // invitado sin correo
    expect((await hasActiveAlert(db, "ana", AGOTADO))?.id).toBe(rows[0].id);
  });

  it("solo para productos agotados y existentes; no crea consultas ni ventas ni toca el stock", async () => {
    expect(await code(subscribeRestock(db, { productId: "storm-sobre", consent: true, email: "a@b.com" }, guest))).toBe("order_rule"); // hay stock: se compra
    expect(await code(subscribeRestock(db, { productId: "no-existe", consent: true, email: "a@b.com" }, guest))).toBe("not_found");
    await subscribeRestock(db, { productId: AGOTADO, consent: true, email: "a@b.com" }, guest);
    expect(await db.select().from(inquiries)).toHaveLength(0);
    expect(await db.select().from(sales)).toHaveLength(0);
    expect(await db.select().from(productOverrides)).toHaveLength(0);
  });
});

describe("cancelar y contar", () => {
  it("se cancela con el enlace secreto o desde la cuenta; cancelar de nuevo no hace nada y permite anotarse otra vez", async () => {
    const a = await subscribeRestock(db, { productId: AGOTADO, consent: true, email: "a@b.com" }, guest, 1);
    await subscribeRestock(db, { productId: AGOTADO, consent: true }, account("ana"), 2);
    expect(await cancelRestock(db, { token: "token-equivocado" })).toEqual({ changed: false, found: false });
    expect(await cancelRestock(db, { token: a.cancelToken! }, 5)).toEqual({ changed: true, found: true });
    expect(await cancelRestock(db, { token: a.cancelToken! }, 6)).toEqual({ changed: false, found: true });
    const mine = (await listUserAlerts(db, "ana"))[0];
    expect(await cancelRestock(db, { id: mine.id, userId: "beto" })).toEqual({ changed: false, found: false }); // otra cuenta no puede
    expect(await cancelRestock(db, { id: mine.id, userId: "ana" })).toMatchObject({ changed: true });
    expect((await waitingCounts(db)).get(AGOTADO) ?? 0).toBe(0);
    await subscribeRestock(db, { productId: AGOTADO, consent: true, email: "a@b.com" }, guest, 10); // vuelve a anotarse
    expect((await waitingCounts(db)).get(AGOTADO)).toBe(1);
  });

  it("el panel cuenta cuántas personas esperan cada producto (solo avisos activos)", async () => {
    await subscribeRestock(db, { productId: AGOTADO, consent: true, email: "a@b.com" }, guest);
    await subscribeRestock(db, { productId: AGOTADO, consent: true, email: "c@d.com" }, guest);
    await subscribeRestock(db, { productId: AGOTADO, consent: true }, account("ana"));
    expect((await waitingCounts(db)).get(AGOTADO)).toBe(3);
  });
});

describe("avisar la reposición", () => {
  it("solo si hay stock cargado; un correo por persona, sin duplicar, sin reservar nada", async () => {
    await subscribeRestock(db, { productId: AGOTADO, consent: true, email: "a@b.com" }, guest);
    await subscribeRestock(db, { productId: AGOTADO, consent: true }, account("ana"));
    expect(await code(notifyRestock(db, AGOTADO, actor))).toBe("order_rule"); // todavía sin stock
    await db.insert(productOverrides).values({ productId: AGOTADO, stockQuantity: 5, orderOnly: false, visible: true, updatedAt: 1, updatedByEmail: actor.email });
    expect(await notifyRestock(db, AGOTADO, actor, 100)).toEqual({ notified: 2 });
    expect(await notifyRestock(db, AGOTADO, actor, 101)).toEqual({ notified: 0 }); // ya avisados
    const rows = await db.select().from(notificationOutbox);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.event === "reposicion" && r.body.includes("no reserva stock") && r.status === "pendiente")).toBe(true);
    expect((await db.select().from(restockAlerts)).every((a) => a.status === "avisado" && a.notifiedAt === 100)).toBe(true);
    const sent: Mail[] = [];
    await flushOutbox(db, { send: async (m) => { sent.push(m); } });
    expect(sent.map((m) => m.to).sort()).toEqual(["a@b.com", "ana@example.com"]);
    expect(await db.select().from(sales)).toHaveLength(0);
    void eq;
  });
});

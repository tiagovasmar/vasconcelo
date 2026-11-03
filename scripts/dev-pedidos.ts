import propuesta from "../src/content/real/propuesta-mayorista.json";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { account, user } from "../src/db/schema";
import { realCatalog } from "../src/content/catalog";
import { describeTarget, isLocalTarget, scriptDb, scriptUrl } from "./lib/env";
import { loadOverrides, saveProductChange } from "../src/features/catalog/overrides";
import { setManualRate } from "../src/features/fx/service";
import { listAllProducts } from "../src/features/catalog/data";
import { createInquiry, hashToken } from "../src/features/inquiries/service";
import { addNote, openTracking, setAgreedAmount, setStage } from "../src/features/pedidos/service";
import { cancelOrderSafe } from "./lib/cancel";
import { confirmPayment, openIncident, registerRefund, uploadReceipt } from "../src/features/pedidos/pagos";
import { createShipment, setShipmentItem, updateShipmentStatus } from "../src/features/pedidos/envios";
import { lineProgress } from "../src/features/pedidos/service";
import { subscribeRestock } from "../src/features/avisos/reposicion";
import { confirmPurchase, createPurchase } from "../src/features/costos/service";
import { registerSale } from "../src/features/sales/service";
import { createWholesaleRequest, reviewWholesaleRequest } from "../src/features/wholesale/service";
import { mayorista } from "../src/content/politicas";
import { publishTiers, saveRules, saveTier } from "../src/features/mayorista/precios";
import { LocalReceiptStore } from "../src/server/receipt-store";
import { flushOutbox } from "../src/features/avisos/outbox";

/**
 * Datos FICTICIOS para la vista previa local de pedidos, encargos, comprobantes, avisos, costos y mayoristas. Solo para la base de desarrollo local (se niega a correr contra otra):
 *   npm run dev:db   →   npm run dev:admin   →   npm run dev:pedidos   →   npm run dev
 * Todo lo que crea (cuentas, importes, tramos, demoras, costos) es de PRUEBA y no representa condiciones reales. El correo es el transporte local (archivos): no sale nada a nadie.
 * Las contraseñas de prueba quedan en `.local/dev-pedidos.txt` (ignorado por Git).
 */
const DAY = 86_400_000;
async function main() {
  const url = scriptUrl();
  if (!isLocalTarget(url) || new URL(url).port === "54400" || process.env.ENTORNO_LOCAL !== "1" || process.env.ENTORNO_DESCARTABLE !== "1") { console.error(`Rechazado: ${describeTarget(url)} no es la base de desarrollo local.`); process.exit(1); }
  const db = scriptDb();
  const actor = { id: "dev-pedidos", email: (process.env.ADMIN_EMAIL ?? "dueno@example.com").toLowerCase() };
  const T = Date.now();
  const at = (d: number) => T - d * DAY;
  const pwFile = path.resolve(process.env.DEV_PEDIDOS_PASSWORD_FILE || ".local/dev-pedidos.txt");
  const pw = fs.existsSync(pwFile) ? fs.readFileSync(pwFile, "utf8").trim() : randomBytes(9).toString("base64url");
  fs.mkdirSync(path.dirname(pwFile), { recursive: true });
  fs.writeFileSync(pwFile, pw);

  const account_ = async (id: string, name: string, email: string) => {
    const [have] = await db.select().from(user).where(eq(user.email, email));
    if (have) return have.id;
    const now = new Date();
    await db.insert(user).values({ id, name, email, emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(account).values({ id: `acc-${id}`, accountId: id, providerId: "credential", userId: id, password: await hashPassword(pw), createdAt: now, updatedAt: now });
    return id;
  };
  const ana = await account_("dev-ana", "Ana Pérez", "ana.prueba@example.com");
  const marta = await account_("dev-marta", "Marta Gómez", "marta.prueba@example.com");

  await setManualRate(db, 1300, actor, "Cotización de PRUEBA para la vista previa local");
  const rows = await loadOverrides(db);
  // Productos de ejemplo con precio en USD y stock (solo en esta base local). Los primeros 6 activos y no retirados.
  const base = realCatalog.products.filter((p) => p.active && !p.retired && !p.addonOnly).slice(0, 6);
  for (const [i, p] of base.entries()) {
    const o = rows.get(p.id);
    await saveProductChange(db, realCatalog.products, p.id, { priceUsdMinor: (20 + i * 15) * 100, stock: i === 0 ? 0 : 6 + i, expectedVersion: o?.updatedAt ?? 0 }, actor);
  }
  const [agotado, a, b, c] = base;
  const products = await listAllProducts(undefined, db);
  void products;
  const owner = (uid: string | null) => ({ sessionTokenHash: hashToken(`dev-pedidos-${uid ?? "invitado"}`), userId: uid });
  const retiro = { method: "retiro" } as const;
  let n = 0;
  const key = () => `dev-pedidos-${Date.now()}-${++n}`.padEnd(24, "0");
  const encargo = async (uid: string | null, lines: Array<{ productId: string; quantity: number }>, name = "Ana Pérez") =>
    (await createInquiry(db, { items: lines.map((l) => ({ ...l, mode: "encargo" })), delivery: retiro, payment: "efectivo", contactName: name, idempotencyKey: key() }, owner(uid))).inquiry.reference;
  const k = () => `dev-op-${Date.now()}-${++n}`.padEnd(24, "0");

  // 1) Encargo en curso de Ana: importe, seña con comprobante, comprado, 2 envíos (uno llegó, otro en tránsito), nota pública y aviso.
  const e1 = await encargo(ana, [{ productId: a.id, quantity: 3 }, { productId: b.id, quantity: 2 }]);
  await openTracking(db, e1, at(30));
  await setAgreedAmount(db, e1, { agreedMinor: 48_000_000 }, actor, at(29));
  await setStage(db, e1, { stage: "confirmado_tienda", occurredAt: at(29), idempotencyKey: k() }, actor, at(29));
  const rc = await uploadReceipt(db, new LocalReceiptStore(), { inquiryId: e1, viewer: { kind: "cuenta", userId: ana }, file: Buffer.from(`%PDF-1.4\n% comprobante de PRUEBA\n%%EOF ${Date.now()}`), originalName: "transferencia-seña.pdf", declaredAmountMinor: 9_600_000 }, at(28));
  await confirmPayment(db, e1, { kind: "sena", amountMinor: 9_600_000, method: "transferencia", paidAt: at(27), receiptId: rc.id, idempotencyKey: k() }, actor, at(27));
  await setStage(db, e1, { stage: "comprado_proveedor", occurredAt: at(25), publicNote: "Compramos tu pedido.", idempotencyKey: k() }, actor, at(25));
  const lines1 = await lineProgress(db, e1);
  const s1 = await createShipment(db, { label: "Lote A · noviembre (PRUEBA)", supplier: "Proveedor de prueba", idempotencyKey: k() }, actor, at(24));
  const s2 = await createShipment(db, { label: "Lote B · noviembre (PRUEBA)", idempotencyKey: k() }, actor, at(24));
  await setShipmentItem(db, s1.id, { lineId: lines1[0].lineId, quantity: 2 }, at(24));
  await setShipmentItem(db, s2.id, { lineId: lines1[0].lineId, quantity: 1 }, at(24));
  await setShipmentItem(db, s2.id, { lineId: lines1[1].lineId, quantity: 2 }, at(24));
  for (const s of [s1, s2]) await updateShipmentStatus(db, s.id, { status: "enviado_proveedor", occurredAt: at(20), idempotencyKey: k() }, actor, at(20));
  await updateShipmentStatus(db, s1.id, { status: "en_transito", occurredAt: at(8), idempotencyKey: k() }, actor, at(8));
  await updateShipmentStatus(db, s1.id, { status: "recibido_argentina", occurredAt: at(2), idempotencyKey: k() }, actor, at(2));
  await addNote(db, e1, { publicText: "Llegó la primera parte. El resto sigue en camino.", internalText: "Pedir al proveedor el número de seguimiento del lote B (nota INTERNA de prueba).", idempotencyKey: k() }, actor, at(2));
  // Un comprobante nuevo de la clienta, todavía sin revisar.
  await uploadReceipt(db, new LocalReceiptStore(), { inquiryId: e1, viewer: { kind: "cuenta", userId: ana }, file: Buffer.from(`%PDF-1.4\n% segundo comprobante de PRUEBA\n%%EOF ${Date.now()}`), originalName: "saldo.pdf", declaredAmountMinor: 38_400_000 }, at(1));

  // 2) Encargo con incidente y reintegro pendiente (paquete perdido, pedido cancelado).
  const e2 = await encargo(ana, [{ productId: c.id, quantity: 1 }]);
  await openTracking(db, e2, at(40));
  await setAgreedAmount(db, e2, { agreedMinor: 12_000_000 }, actor, at(39));
  await setStage(db, e2, { stage: "confirmado_tienda", occurredAt: at(39), idempotencyKey: k() }, actor, at(39));
  await confirmPayment(db, e2, { kind: "sena", amountMinor: 2_400_000, method: "transferencia", paidAt: at(38), idempotencyKey: k() }, actor, at(38));
  await setStage(db, e2, { stage: "comprado_proveedor", occurredAt: at(36), idempotencyKey: k() }, actor, at(36));
  const inc = await openIncident(db, e2, { kind: "paquete_perdido", internalDetail: "El courier no encuentra el paquete (PRUEBA)", publicText: "El paquete se extravió en tránsito.", openedAt: at(5), idempotencyKey: k() }, actor, at(5));
  await cancelOrderSafe(db, e2, actor, at(4));
  await registerRefund(db, e2, { incidentId: inc.id, amountMinor: 2_400_000, idempotencyKey: k() }, actor, at(4));

  // 3) Encargo de un invitado (sin cuenta).
  await encargo(null, [{ productId: b.id, quantity: 1 }], "Invitado Prueba");

  // Ejemplo visible para revisar la seña y el comprobante sin alterar el pedido en tránsito.
  const senaDemo = await encargo(ana, [{ productId: b.id, quantity: 1 }]);
  await setAgreedAmount(db, senaDemo, { agreedMinor: 10_000_000 }, actor, at(1));
  await setStage(db, senaDemo, { stage: "confirmado_tienda", occurredAt: at(1), idempotencyKey: k() }, actor, at(1));
  await addNote(db, senaDemo, { publicText: "Ejemplo FICTICIO para revisar la seña del 20% y adjuntar un comprobante. No realices transferencias para esta demostración.", idempotencyKey: k() }, actor, at(1));

  // 4) Avisos de reposición (producto agotado).
  await subscribeRestock(db, { productId: agotado.id, consent: true, email: "interesada1@example.com" }, { userId: null, accountEmail: null, emailVerified: false }, at(3));
  await subscribeRestock(db, { productId: agotado.id, consent: true, email: "interesado2@example.com" }, { userId: null, accountEmail: null, emailVerified: false }, at(2));
  await subscribeRestock(db, { productId: agotado.id, consent: true }, { userId: ana, accountEmail: "ana.prueba@example.com", emailVerified: true }, at(1));

  // 5) Costos y ganancia: una compra confirmada para `a` (con gastos repartidos) y ventas: una con costo congelado y otra con «Costo pendiente».
  const compra = await createPurchase(db, {
    supplier: "Proveedor de prueba", purchasedAt: at(35), currency: "RMB", rateToArs10k: 1_800_000, rateNote: "cotización ficticia de prueba",
    items: [{ productId: a.id, quantity: 10, unitPriceOriginalMinor: 4500 }, { productId: b.id, quantity: 20, unitPriceOriginalMinor: 2500 }],
    expenses: [{ kind: "envio", amountMinor: 8_000_000, allocation: "unidades" }, { kind: "impuestos", amountMinor: 3_500_000, allocation: "valor" }], idempotencyKey: k(),
  }, actor, at(35));
  await confirmPurchase(db, compra.id, actor, at(35));
  await registerSale(db, { items: [{ productId: a.id, quantity: 2, unitPriceMinor: 5_200_000 }], paymentMethod: "transferencia", idempotencyKey: k() }, actor, { now: at(10) });
  await registerSale(db, { items: [{ productId: c.id, quantity: 1, unitPriceMinor: 3_900_000 }], paymentMethod: "efectivo", idempotencyKey: k() }, actor, { now: at(6) });

  // 6) Mayorista (condiciones y tramos FICTICIOS, solo en esta base local): Marta solicita y el dueño aprueba; el catálogo queda abierto.
  const { request } = await createWholesaleRequest(db, marta, { businessName: "Kiosco de Marta (prueba)", locality: "Haedo", province: "Buenos Aires" }, at(12));
  await reviewWholesaleRequest(db, request.reference, "aprobada", actor.email, { now: at(11) });
  for (const product of propuesta) {
    const current = (await loadOverrides(db)).get(product.id);
    await saveProductChange(db, realCatalog.products, product.id, { priceUsdMinor: Math.round(product.retailUsd * 100), expectedVersion: current?.updatedAt ?? 0 }, actor);
    for (const [minQty, usd] of product.tiers) {
      await saveTier(db, { productId: product.id, minQty, unitPriceUsdMinor: Math.round(usd * 100) }, actor, at(9));
    }
    if (!product.draft) await publishTiers(db, product.id, actor, at(9));
  }
  await saveRules(db, { minBoxes: 2, minUnits: null, minAmountMinor: null, combine: "producto", delayText: "entre 8 y 15 días", delayFrom: "la confirmación de la seña", refundPeriod: "Plazo FICTICIO de prueba, pendiente de definición real", cancellationPolicy: mayorista.cancellationPolicy, open: true }, actor, at(9));

  // Avisos pendientes de los hechos anteriores: se "envían" al transporte LOCAL (archivos), nunca a nadie.
  await flushOutbox(db, { limit: 100 });
  console.log(`Vista previa de pedidos lista en ${describeTarget(url)}.\n  Clienta: ana.prueba@example.com · Mayorista aprobada: marta.prueba@example.com · contraseña de prueba en .local/dev-pedidos.txt\n  Pedidos: ${e1} (encargo en curso), ${e2} (cancelado con reintegro pendiente).\n  Administrador: ejecutá \`npm run dev:admin\` (usa ADMIN_EMAIL) y entrá a /admin/pedidos.`);
  await db.$client.end({ timeout: 5 });
}
main().catch((e) => { console.error(e); process.exit(1); });

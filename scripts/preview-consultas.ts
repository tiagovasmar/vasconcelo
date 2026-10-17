import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Vista previa LOCAL y AISLADA de Consultas / Ventas / Stock para revisar con el dueño. No toca ninguna base real:
 *  - levanta un PostgreSQL descartable propio (puerto PREVIEW_PG_PORT, 54500), migrado con el esquema actual;
 *  - usa el catálogo de PRUEBA (productos ficticios con precio y stock de ejemplo), NO el catálogo real ni sus datos;
 *  - crea una cuenta de dueño local (correo ficticio, confirmado) y datos de ejemplo claramente falsos;
 *  - deja la contraseña de esa cuenta SOLO en `.local/preview-consultas-acceso.txt` (carpeta ignorada por Git);
 *  - arranca la tienda en http://localhost:3210 con variables propias (las de `.env.local` quedan anuladas).
 * Ctrl+C lo detiene y borra todos los datos de la vista previa.
 *
 *   SKIP_ENV_FILES=1 npx tsx --conditions=react-server scripts/preview-consultas.ts
 */
const PORT = Number(process.env.PREVIEW_PORT || 3210);
const PG_PORT = Number(process.env.PREVIEW_PG_PORT || 54500);
const OWNER_EMAIL = "dueno-local@example.com";

async function main() {
  // El catálogo de prueba se elige antes de importar nada que lo use.
  process.env.CATALOG_FIXTURE = "demo";
  process.env.FX_AUTO_REFRESH = "0";
  process.env.STORAGE_DRIVER = "local";

  const { startTestPostgres, createDatabaseFromTemplate } = await import("./lib/test-postgres");
  const { createDb } = await import("../src/db/client");
  const { account, user } = await import("../src/db/schema");
  const { hashPassword } = await import("better-auth/crypto");

  const pg = await startTestPostgres({ port: PG_PORT });
  await createDatabaseFromTemplate(pg.adminUrl, "preview_consultas");
  const url = pg.urlFor("preview_consultas");
  const db = createDb(url, { max: 4 });

  // --- cuenta del dueño local ---
  const password = randomBytes(9).toString("base64url");
  const now = new Date();
  const ownerId = randomBytes(16).toString("hex");
  await db.insert(user).values({ id: ownerId, name: "Dueño (vista previa)", email: OWNER_EMAIL, emailVerified: true, createdAt: now, updatedAt: now });
  await db.insert(account).values({ id: randomBytes(16).toString("hex"), accountId: ownerId, providerId: "credential", userId: ownerId, password: await hashPassword(password), createdAt: now, updatedAt: now });
  const accessFile = path.resolve(".local/preview-consultas-acceso.txt");
  fs.mkdirSync(path.dirname(accessFile), { recursive: true });
  fs.writeFileSync(accessFile, `Vista previa LOCAL de Consultas y Ventas (datos y catálogo de PRUEBA, base descartable)\nURL: http://localhost:${PORT}/cuenta/ingresar\nCorreo: ${OWNER_EMAIL}\nContraseña: ${password}\n`);

  // --- datos de ejemplo (ficticios) ---
  const { createInquiry, hashToken } = await import("../src/features/inquiries/service");
  const { applyInquiryAction, createManualInquiry } = await import("../src/features/consultas/service");
  const { linkSaleToInquiry, registerSale, voidSale } = await import("../src/features/sales/service");
  const actor = { id: ownerId, email: OWNER_EMAIL };
  const fx = { status: "manual", mode: "manual", rate10k: 12_340_000, asOf: 1, providerUpdatedAt: null, source: "vista previa", warn: false } as const;
  const day = 24 * 3600 * 1000;
  let n = 0;
  const key = () => `preview-${String(++n).padStart(6, "0")}-abcdefghij`;
  const mk = async (name: string, phone: string | undefined, items: Array<{ productId: string; quantity: number; mode?: "buy" | "encargo" }>, ago: number) => {
    const { inquiry } = await createInquiry(db, { items, delivery: { method: "retiro" }, payment: "efectivo", contactName: name, contactPhone: phone, idempotencyKey: key() }, { sessionTokenHash: hashToken(`sesion-${n}`), now: Date.now() - ago * day });
    return inquiry.reference;
  };
  const sale = (items: Array<{ productId: string; quantity: number; price: number }>, over: Record<string, unknown> = {}) => ({
    items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPriceMinor: i.price * 100 })), paymentMethod: "efectivo", idempotencyKey: key(), ...over,
  });

  const c1 = await mk("Lucía Fernández", "11 5555-0101", [{ productId: "ejemplo-sobre", quantity: 4 }, { productId: "ejemplo-caja", quantity: 1 }], 6);
  const c2 = await mk("Martín Gómez", "11 5555-0202", [{ productId: "storm-pack5", quantity: 2 }], 5);
  const c3 = await mk("Camila Ríos", undefined, [{ productId: "storm-sobre", quantity: 6 }], 3);
  const c4 = await mk("Joaquín Paz", "11 5555-0404", [{ productId: "ejemplo-sobre", quantity: 2 }], 2);
  const c5 = await mk("Sofía Luna", "11 5555-0505", [{ productId: "storm-caja", quantity: 1 }], 1);
  await mk("Nicolás Vega", "11 5555-0606", [{ productId: "storm-sobre", quantity: 1 }, { productId: "ejemplo-caja", quantity: 1, mode: "encargo" }], 0);
  await createManualInquiry(db, { idempotencyKey: key(), customerName: "Paula Herrera", customerPhone: "11 4444-9999", channel: "instagram", receivedAt: Date.now() - 4 * day, paymentMethod: "transferencia", lines: [{ productId: "storm-sobre", quantity: 3, fulfillment: "stock", unitPriceMinor: 950000 }], note: "Escribió por Instagram" }, actor);

  await applyInquiryAction(db, c1, { action: "confirm_contact" }, actor);
  await applyInquiryAction(db, c2, { action: "confirm_contact" }, actor);
  await applyInquiryAction(db, c2, { action: "set_status", status: "en_seguimiento" }, actor);
  await applyInquiryAction(db, c2, { action: "note", text: "Quedó en confirmar el viernes." }, actor);
  await applyInquiryAction(db, c3, { action: "set_status", status: "no_concretada", reason: "Le pareció caro" }, actor);
  await applyInquiryAction(db, c4, { action: "confirm_contact" }, actor);
  await applyInquiryAction(db, c4, { action: "set_status", status: "en_seguimiento" }, actor);

  // c1: se vende MENOS de lo consultado (3 sobres y la caja). c5: venta cargada antes por otro lado y después vinculada. c4: venta anulada y vuelta a convertir.
  await registerSale(db, sale([{ productId: "ejemplo-sobre", quantity: 3, price: 12500 }, { productId: "ejemplo-caja", quantity: 1, price: 205000 }], { inquiryId: c1, paymentMethod: "transferencia" }), actor, { fx, now: Date.now() - 5 * day });
  const suelta = await registerSale(db, sale([{ productId: "storm-caja", quantity: 1, price: 185000 }]), actor, { fx, now: Date.now() - 1 * day });
  await linkSaleToInquiry(db, suelta.sale.id, c5, actor);
  const anulada = await registerSale(db, sale([{ productId: "ejemplo-sobre", quantity: 2, price: 12500 }], { inquiryId: c4 }), actor, { fx, now: Date.now() - 2 * day });
  await voidSale(db, anulada.sale.id, "Pago rechazado", actor);
  await db.$client.end({ timeout: 5 });

  // --- la tienda, con variables propias (anulan las de .env.local) ---
  const env = {
    ...process.env,
    DATABASE_URL: url, DIRECT_URL: "", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_STORAGE_BUCKET: "",
    ADMIN_EMAIL: OWNER_EMAIL, CATALOG_FIXTURE: "demo", FX_AUTO_REFRESH: "0", STORAGE_DRIVER: "local", UPLOADS_DIR: path.resolve(".local/preview-consultas-uploads"),
    MAIL_TRANSPORT: "local", MAIL_DIR: path.resolve(".local/preview-consultas-mail"), WHATSAPP_NUMBER: "", NEXT_DIST_DIR: ".next-preview-consultas", SKIP_ENV_FILES: "1",
    BETTER_AUTH_URL: `http://localhost:${PORT}`, BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_SECRET_FILE: path.resolve(".local/preview-consultas.secret"),
  };
  console.log(`\nVista previa lista: http://localhost:${PORT}/admin/consultas\nAcceso: ver ${accessFile}\n(catálogo de PRUEBA y base descartable; Ctrl+C la borra)\n`);
  const next = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", String(PORT)], { env, stdio: "inherit", shell: process.platform === "win32" });
  const stop = async () => {
    next.kill();
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  next.on("exit", stop);
}
main().catch((e) => { console.error(e); process.exit(1); });

import fs from "node:fs";
import path from "node:path";
import { realCatalog as catalog } from "../src/content/catalog";
import { commercialState } from "../src/features/catalog/commercial";
import { store } from "../src/content/store";
import { legal, pendingLegalFields } from "../src/content/legal";
import { paymentMethods } from "../src/content/checkout-options";
import { validateCatalog } from "../src/features/catalog/validate";
import arteInicio from "../src/content/colecciones/imagenes-inicio.json";
import { scriptDb } from "./lib/env";
import { mailConfig } from "../src/server/mail";
import { supabaseStorageConfig } from "../src/server/storage";
import { applyOverrides, loadGalleries, loadOverrides } from "../src/features/catalog/overrides";
import { getEffectiveRate } from "../src/features/fx/service";
import { parseWhatsappNumber } from "../src/features/inquiries/whatsapp-number";

/**
 * Revisión previa a una publicación comercial. Durante la demo local los bloqueantes son ESPERABLES y no impiden
 * desarrollar ni evaluar la tienda; impiden afirmar que está lista para vender públicamente (sale con código 1).
 * No contrata ni publica nada: solo lee el proyecto y el entorno.
 */
type Item = { level: "bloqueante" | "aviso" | "info"; area: string; text: string; fix: string };
async function main() {
const items: Item[] = [];
const add = (level: Item["level"], area: string, text: string, fix: string) => items.push({ level, area, text, fix });
const exists = (p: string) => fs.existsSync(path.join(process.cwd(), "public", p.replace(/^\//, "")));
const env = process.env;

// --- Marca y datos del comercio
if (store.isDemo) add("bloqueante", "Marca", `La tienda sigue en modo demo (store.isDemo = true) con el nombre comercial «${store.name}» (confirmado); falta el logo definitivo y los datos legales.`, "Cargar el logo y los datos legales y poner isDemo en false en src/content/store.ts.");
const legalPending = pendingLegalFields();
if (legalPending.length) add("bloqueante", "Legal", `Faltan datos del comercio en los textos legales: ${legalPending.join(", ")}.`, "Completar src/content/legal.ts (CUIT, domicilio, contacto, políticas) con asesoramiento legal.");
if (legal.isDraft) add("bloqueante", "Legal", "Privacidad y Condiciones siguen marcadas como BORRADOR (legal.isDraft = true).", "Revisar los textos con el comercio/asesor y poner isDraft en false.");

// --- WhatsApp
if (!parseWhatsappNumber(env.WHATSAPP_NUMBER || store.whatsappNumber)) add("bloqueante", "WhatsApp", "No hay número de WhatsApp válido: las consultas funcionan solo en modo demo (sin abrir ningún chat).", "Definir WHATSAPP_NUMBER (solo dígitos, formato internacional) o store.whatsappNumber.");

// --- Catálogo
const issues = validateCatalog(catalog, exists);
const errors = issues.filter((i) => i.level === "error");
if (errors.length) add("bloqueante", "Catálogo", `npm run catalog:check tiene ${errors.length} error(es): ${errors.slice(0, 3).map((e) => `${e.where}: ${e.message}`).join(" | ")}`, "Corregir los errores del catálogo.");
const demoActive = catalog.products.filter((p) => p.active && p.isDemo);
if (demoActive.length) add("bloqueante", "Catálogo", `${demoActive.length} producto(s) activo(s) son de demostración (isDemo): ${demoActive.map((p) => p.sku).join(", ")}.`, "Reemplazar por productos reales (docs/CATALOGO.md) y retirar los de demo (active: false o borrarlos del catálogo).");
// Precio/stock vigentes = catálogo por código + valores cargados desde /admin (si existe la base local).
let efectivos = catalog.products;
if ((env.DIRECT_URL || env.DATABASE_URL || "").trim()) {
  try {
    const db = scriptDb();
    efectivos = applyOverrides(catalog.products, await loadOverrides(db), await getEffectiveRate(db), await loadGalleries(db));
    await db.$client.end({ timeout: 5 });
  } catch (e) {
    add("aviso", "Base de datos", `No se pudo leer la base configurada para revisar precios y stock (${e instanceof Error ? e.message.slice(0, 80) : "error"}).`, "Revisar DATABASE_URL / DIRECT_URL y correr npm run db:migrate.");
  }
}
const pendientes = efectivos.filter((p) => p.active && commercialState(p) === "pending");
if (pendientes.length) add("bloqueante", "Catálogo", `${pendientes.length} producto(s) activo(s) no tienen precio ARS y/o stock confirmados (se ven como «Precio a confirmar» y no se pueden consultar con importe): ${pendientes.map((p) => p.sku).join(", ")}.`, "Completar datos/precios-y-stock.csv y ejecutar npm run precios:importar -- --write (docs/OPERACION.md).");
if (env.CATALOG_FIXTURE) add("bloqueante", "Catálogo", "CATALOG_FIXTURE está definido: se estaría usando el catálogo de PRUEBA (ficticio).", "Quitar CATALOG_FIXTURE del entorno de producción.");
const demoSets = catalog.expansions.filter((e) => e.isDemo);
if (demoSets.length) add("bloqueante", "Catálogo", `${demoSets.length} expansión(es) son ficticias: ${demoSets.map((e) => e.name).join(", ")}.`, "Quitarlas cuando existan expansiones reales.");
const noList = catalog.expansions.filter((e) => !e.isDemo && e.cardListStatus !== "complete");
if (noList.length) add("aviso", "Catálogo", `Lista de cartas no completa/verificada en: ${noList.map((e) => `${e.name} (${e.cardListStatus})`).join(", ")}.`, "Cargar las cartas verificadas con fuente (o dejarlo como «no disponible», que es honesto).");

// --- Imágenes
const sinFotosPropias = catalog.products.filter((p) => p.active && !p.images.some((i) => i.source === "store"));
if (sinFotosPropias.length) add("aviso", "Imágenes", `${sinFotosPropias.length} ficha(s) no tienen fotos reales del stock de la tienda (solo fotos de referencia del fabricante o del proveedor).`, "Tomar las fotos de docs/FOTOS-A-TOMAR.md y cargarlas en src/content/real/store-photos.json.");
const productImgs = catalog.products.filter((p) => p.active).flatMap((p) => p.images);
const cardImgs = catalog.expansions.flatMap((e) => e.cards.map((c) => c.image));
// Incluye el arte del banner del inicio (recorte de una carta oficial, también sin permiso concedido).
const inicioImgs = arteInicio.map((a) => ({ ...a, status: a.status as "reference" | "final" | "demo" }));
const allImgs = [...productImgs, ...cardImgs, ...inicioImgs] as typeof productImgs;
const notFinal = allImgs.filter((i) => i.status !== "final");
if (notFinal.length) add("bloqueante", "Imágenes", `${notFinal.length} imagen(es) de producto/carta no tienen permiso de uso registrado (${allImgs.filter((i) => i.status === "reference").length} son fotos/cartas oficiales de REFERENCIA y ${allImgs.filter((i) => i.status === "demo").length} son ilustraciones de reserva). El enlace de origen no concede permiso.`, "Obtener permiso o reemplazar por fotos propias del inventario, y marcarlas status: \"final\" con origin y license (docs/ASSETS-PENDIENTES.md).");
const missing = allImgs.filter((i) => !exists(i.src));
if (missing.length) add("bloqueante", "Imágenes", `${missing.length} archivo(s) de imagen declarados no existen en public/images.`, "Copiar los archivos con las rutas declaradas.");
const homeAssets = ["hero/hero-bg.webp", "hero/hero-productos.png", "categories/cat-cajas.png", "categories/cat-sobres.png", "categories/cat-packs.png", "expansions/expansion-cartas.png"];
const homeMissing = homeAssets.filter((a) => !exists(`/images/${a}`));
if (homeMissing.length) add("bloqueante", "Imágenes", `Faltan ${homeMissing.length} de 6 imágenes del inicio (se usa arte vectorial de reserva): ${homeMissing.join(", ")}.`, "Ver docs/ASSETS-PENDIENTES.md (tamaños y uso).");

// --- Entorno de producción
if (!/^[^s@]+@[^s@]+.[^s@]+$/.test((env.ADMIN_EMAIL ?? "").trim())) add("bloqueante", "Panel", "ADMIN_EMAIL no está definido: el panel /admin queda cerrado y no se pueden administrar precios ni stock.", "Definir ADMIN_EMAIL con el correo de la cuenta del dueño (registrada y confirmada). Ver docs/ADMIN.md.");
if (!env.BETTER_AUTH_SECRET) add("bloqueante", "Cuentas", "BETTER_AUTH_SECRET no está definido (en producción es obligatorio).", "Generar un secreto largo y aleatorio y definirlo en el entorno del servidor (nunca en el repositorio).");
if (!env.BETTER_AUTH_URL || /localhost|127\.0\.0\.1/.test(env.BETTER_AUTH_URL) || !env.BETTER_AUTH_URL.startsWith("https://")) add("bloqueante", "Cuentas", "BETTER_AUTH_URL no apunta a una URL pública https.", "Definir BETTER_AUTH_URL=https://tu-dominio.");
if (env.MAIL_TRANSPORT === "local") add("bloqueante", "Correo", "MAIL_TRANSPORT=local está activo: los correos se guardan en archivos en vez de enviarse (solo sirve para probar en tu computadora).", "Quitar MAIL_TRANSPORT del entorno de producción.");
if (!mailConfig()) add("bloqueante", "Correo", "No hay proveedor de correo transaccional configurado (MAIL_PROVIDER, MAIL_API_KEY y MAIL_FROM): en producción el transporte local está deshabilitado y las cuentas nuevas no pueden confirmar su correo ni recuperar el acceso (el administrador sigue pudiendo ingresar).", "Elegir un proveedor y un remitente verificado (sin dominio propio: ver docs/CORREO.md), cargar las variables en Netlify y probar un envío real.");
if (!env.DATABASE_URL) add("bloqueante", "Base de datos", "DATABASE_URL no está definido: la tienda no tiene base PostgreSQL (Supabase) a la que conectarse.", "Cargar la cadena del pooler de Supabase en modo transacción (puerto 6543) en las variables de Netlify.");
else if (!/:6543\b/.test(env.DATABASE_URL)) add("aviso", "Base de datos", "DATABASE_URL no usa el puerto 6543 (pooler en modo transacción): en funciones serverless se pueden agotar las conexiones.", "Usar la cadena «Transaction pooler» de Supabase para DATABASE_URL.");
if (!supabaseStorageConfig()) add("bloqueante", "Fotos", "Falta SUPABASE_URL y/o SUPABASE_SECRET_KEY: las fotos subidas desde el panel no tienen dónde guardarse en producción.", "Crear el bucket product-images en Supabase y cargar las variables (solo servidor).");
add("bloqueante", "Hosting", "La vista previa corre en una dirección temporal de netlify.app, sin dominio propio y con planes gratuitos de Netlify y Supabase (con límites y pausa por inactividad en Supabase).", "Antes del lanzamiento público definir dominio, plan y respaldos periódicos (docs/DESPLIEGUE-NETLIFY-SUPABASE.md, sección «Límites de los planes gratuitos»).");

// --- Avisos informativos
const unverified = catalog.guarantees.filter((g) => g.evidence === "unverified");
if (unverified.length) add("aviso", "Garantías", `${unverified.length} garantía(s) sin verificar (no se muestran como promesa).`, "Verificar con fuente aplicable o eliminarlas.");
const noRates = catalog.pullRates.filter((r) => r.evidence === "unavailable");
if (noRates.length) add("info", "Probabilidades", `${noRates.length} tasa(s) figuran como «Dato no disponible»: no hay evidencia cargada (es correcto no inventarla).`, "Cargar tasas oficiales/observadas solo con fuente y método (docs/CATALOGO.md).");
if (paymentMethods.every((m) => m.id === "coordinar")) add("info", "Pagos", "Solo está habilitada la preferencia «A coordinar por WhatsApp».", "Agregar métodos en src/content/checkout-options.ts cuando el dueño confirme cuáles acepta.");
add("info", "Stock", "El stock es manual: se actualiza editando stockQuantity y publicando.", "Definir quién y cuándo actualiza el stock tras cada venta (docs/OPERACION.md).");
add("info", "Accesibilidad", "Las pruebas automatizadas (axe) no reemplazan una prueba con lector de pantalla.", "Hacer una revisión manual con lector de pantalla antes de publicar.");

// --- Informe
const order = ["bloqueante", "aviso", "info"] as const;
const title = { bloqueante: "BLOQUEANTES para publicar", aviso: "AVISOS", info: "INFORMATIVO" } as const;
for (const lvl of order) {
  const list = items.filter((i) => i.level === lvl);
  if (!list.length) continue;
  console.log(`\n${title[lvl]} (${list.length})`);
  for (const i of list) console.log(`  • [${i.area}] ${i.text}\n      → ${i.fix}`);
}
const blockers = items.filter((i) => i.level === "bloqueante").length;
console.log(
  blockers
    ? `\nResultado: ${blockers} bloqueante(s). La aplicación local puede estar terminada, pero NO está lista para vender públicamente.`
    : "\nResultado: sin bloqueantes. Revisá igualmente los avisos antes de publicar.",
);
process.exit(blockers ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

import type { Expansion, Guarantee, ImageAsset, NameInfo, Product, Source } from "../schema";
import datos from "../colecciones/origen/china/productos.json";
import imagenes from "../colecciones/imagenes-china.json";
import commercial from "./commercial.json";

/**
 * Catálogo chino (chino simplificado, China continental): se arma desde `origen/china/productos.json` (definición revisada a mano,
 * con la evidencia de cada ficha) y `imagenes-china.json` (fotos copiadas y optimizadas por `importar-chinos.mjs`).
 *
 * Reglas: nombre principal de colección EN INGLÉS (contrastado con fuentes y rotulado como oficial, comunitario o descriptivo; ninguno tiene un nombre inglés oficial publicado por el fabricante salvo «30th Celebration», impreso en el envase), con el resto del sitio en español; nombre original en chino y nombres españoles anteriores como alias buscables; los códigos son solo los impresos en los envases; ninguna
 * colección reutiliza la lista de cartas japonesa (no es equivalente) ni se crean expansiones ficticias; precio y stock pendientes
 * salvo que el dueño los cargue por SKU (`commercial.json`); toda garantía se limita al contenido físico que muestra la ficha.
 */
const FECHA = datos.consultado;
const LICENCIA = "Sin permiso de uso concedido por el enlace de origen. Imagen de una publicación de un proveedor en Tmall/Taobao, guardada localmente por el dueño: referencia, no acredita el estado del inventario de la tienda.";

type CommercialItem = { priceMinor?: number | null; stockQuantity?: number | null; maxPerOrder?: number | null; ownerSealCondition?: string | null };
const comercial = (commercial as { items: Record<string, CommercialItem> }).items;

const fuenteDe = (id: string) => datos.fuentes.find((f) => f.id === id)!;
const sourceId = (articulo: string) => `zh-src-${articulo}`;

const sourceName = (id: string) => `zh-nombre-${id}`;
/** Fuentes consultadas solo para contrastar los nombres en inglés (no para el contenido de las fichas). */
const nameSources: Source[] = datos.fuentesNombres.map((n) => ({
  id: sourceName(n.id),
  url: n.url,
  publisher: n.publisher,
  consultedAt: "2026-10-13",
  scope: `Nombre en inglés: ${n.alcance}`,
  note: "Fuente comunitaria o comercial, no oficial: sirve para contrastar el nombre en inglés. El fabricante no publica un nombre inglés para estas ediciones.",
}));
type NameData = { nombreEnPrincipal: string; nombreEnTipo: string; nombreEnCerteza: string; nombreEnVariantes: string[]; nombreEnFuentes: string[]; nombreEnVerificadoEl: string };
const nameInfoOf = (x: NameData): NameInfo => ({
  kind: x.nombreEnTipo === "oficial" ? "official" : x.nombreEnTipo === "descriptivo" ? "descriptive" : "community",
  certainty: x.nombreEnCerteza === "coinciden" ? "sources_agree" : x.nombreEnCerteza === "variantes" ? "variants" : "inferred",
  variants: x.nombreEnVariantes,
  sourceIds: x.nombreEnFuentes.map(sourceName),
  verifiedAt: x.nombreEnVerificadoEl,
});
/** Frase que aclara de dónde sale el nombre en inglés (se reutiliza en colecciones y fichas). */
const nombreEnTexto = (x: NameData, nombreEs?: string) => {
  const tipo = x.nombreEnTipo === "oficial" ? "es el nombre oficial impreso en el envase" : x.nombreEnTipo === "descriptivo" ? "es una traducción descriptiva en inglés, NO oficial" : "es el nombre con el que lo difunden bases de datos y tiendas en inglés, NO un nombre oficial del fabricante";
  const variantes = x.nombreEnVariantes.length ? ` Otras denominaciones vistas: ${x.nombreEnVariantes.join("; ")}.` : "";
  const dudas = x.nombreEnCerteza === "coinciden" ? " Las fuentes consultadas coinciden." : x.nombreEnCerteza === "variantes" ? " Las fuentes no coinciden del todo en el nombre." : " Se dedujo por el patrón de una fuente hermana.";
  return `Nombre principal en inglés «${x.nombreEnPrincipal}»: ${tipo}.${dudas}${variantes}${nombreEs ? ` Nombre anterior en español: «${nombreEs}».` : ""}`;
};

export const sources: Source[] = [...datos.fuentes.map((f) => ({
  id: sourceId(f.id),
  url: f.url,
  publisher: `Publicación en ${f.plataforma === "tmall" ? "Tmall" : "Taobao"} · tienda «${f.tienda}»${f.tienda.includes("官方旗舰店") ? " (se presenta como tienda oficial; no verificado)" : " (revendedor)"}`,
  consultedAt: FECHA,
  scope: `Fotos y textos de la publicación «${f.tema}» (artículo ${f.id}) guardados localmente por el dueño: nombre original, cantidad de cartas por sobre y contenido que figura en la ficha y en las fotos del envase.`,
  note: "Fuente de un proveedor, no del fabricante: los datos se tomaron de sus imágenes y pueden cambiar. El enlace puede pedir inicio de sesión en Tmall/Taobao y no concede permiso de uso de las imágenes.",
})), ...nameSources];

const productosPorColeccion = (id: string) => datos.productos.filter((p) => p.coleccion === id);

export const expansions: Expansion[] = datos.colecciones.map((c) => {
  const prods = productosPorColeccion(c.id);
  const fuentes = [...new Set(prods.map((p) => sourceId(p.fuente)))];
  return {
    id: c.id,
    slug: c.slug,
    name: c.nombreEnPrincipal,
    originalName: c.nombre,
    nameInfo: nameInfoOf(c),
    aliases: [c.nombreEs, c.aliases, ...c.nombreEnVariantes].filter((a): a is string => Boolean(a)),
    ...(c.codigoEnvase ? { code: c.codigoEnvase } : {}),
    language: "zh",
    region: "CN",
    series: c.serie,
    summary: `Colección de la edición china simplificada (China continental) de la serie ${c.serie}. Nombre original: ${c.nombre}. ${nombreEnTexto(c, c.nombreEs)}${c.codigoEnvase ? ` Código impreso en el envase: ${c.codigoEnvase}.` : ""} No equivale a ninguna expansión japonesa ni internacional.`,
    cardListStatus: "unavailable",
    cardListNote: "Todavía no hay una lista de cartas cargada para esta edición china. No se reutiliza la lista de una expansión japonesa porque no es equivalente.",
    cards: [],
    isDemo: false,
    sourceIds: [...fuentes, ...c.nombreEnFuentes.map(sourceName)],
    tone: c.tone as Expansion["tone"],
  } satisfies Expansion;
});

const imagenesDe = (productId: string): ImageAsset[] =>
  datos.productos.find((p) => p.id === productId)!.imagenes.map((im, i): ImageAsset => {
    const reg = imagenes.find((r) => r.productId === productId && r.index === i);
    if (!reg) throw new Error(`Falta la imagen ${i} de ${productId}: ejecutá node scripts/colecciones/importar-chinos.mjs`);
    const f = fuenteDe(im.fuente);
    return { src: reg.src, alt: im.alt, width: reg.width, height: reg.height, status: "reference", source: "supplier", view: im.view as ImageAsset["view"], opaque: !reg.hasAlpha, origin: `${f.url} (archivo ${im.archivo})`, license: `${LICENCIA} ${reg.operacion}.` };
  });

const kinds = { booster: "booster", pack: "pack", box: "box", kit: "kit", "special-box": "special-box", "illustration-set": "illustration-set", bundle: "bundle" } as const;

const colecciones = new Map(datos.colecciones.map((c) => [c.id, c as unknown as NameData & { nombreEs: string }]));

export const products: Product[] = datos.productos.map((p): Product => {
  const exp = expansions.find((e) => e.id === p.coleccion);
  const c = comercial[`${p.sku}`] ?? {};
  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    title: p.titulo,
    originalTitle: p.nombreOriginal,
    ...("nombreEnPrincipal" in p ? { nameInfo: nameInfoOf(p as unknown as NameData) } : {}),
    kind: kinds[p.tipo as keyof typeof kinds],
    ...(p.variante ? { variant: p.variante } : {}),
    aliases: [...p.aliases.flatMap((a) => (a ? [a] : [])), p.nombreOriginal, p.tituloEs, ...(exp ? [exp.name] : []), ...(("nombreEnVariantes" in p ? p.nombreEnVariantes : []) as string[])],
    language: "zh",
    region: "CN",
    expansionIds: exp ? [exp.id] : [],
    currency: "ARS",
    priceMinor: c.priceMinor ?? null,
    stockQuantity: c.stockQuantity ?? null,
    ...(c.maxPerOrder ? { maxPerOrder: c.maxPerOrder } : {}),
    ownerSealCondition: c.ownerSealCondition ?? null,
    active: !("retirado" in p && p.retirado) && !("borrador" in p && p.borrador),
    ...("borrador" in p && p.borrador ? { draftNote: p.borrador as string } : {}),
    ...("retirado" in p && p.retirado ? { retired: { date: p.retirado.fecha, reason: p.retirado.motivo } } : {}),
    isDemo: false,
    ...(["box", "special-box", "kit"].includes(p.tipo) ? { rarityReview: { status: "not_documented" as const, checkedAt: FECHA, sourceIds: [sourceId(p.fuente)], note: "Se revisó la ficha del proveedor (textos y gráficos guardados por el dueño): informa la cantidad de cartas por sobre y el contenido físico, y no declara rarezas garantizadas por sobre ni por caja. No se consultó una fuente oficial de la edición china ni se trasladó ninguna garantía japonesa." } } : {}),
    createdAt: FECHA,
    images: imagenesDe(p.id),
    fallbackTone: exp?.tone ?? "paper",
    description: `${p.descripcion} ${"nombreEnPrincipal" in p ? nombreEnTexto(p as unknown as NameData, p.tituloEs) : `Colección «${exp?.name}»: ${nombreEnTexto(colecciones.get(p.coleccion!)!, colecciones.get(p.coleccion!)!.nombreEs)}`} Nombre original: «${p.nombreOriginal}».`,
    contents: p.contenido.map((x) => ({ label: x.label, ...("quantity" in x && x.quantity ? { quantity: x.quantity } : {}), ...("unit" in x && x.unit ? { unit: x.unit } : {}), ...("note" in x && x.note ? { note: x.note } : {}) })),
    guaranteeIds: [], // se completan abajo
  };
});

/**
 * Una sola garantía por producto: el CONTENIDO FÍSICO que informan la ficha y las fotos de origen (evidencia «seller_pack_contents»).
 * No hay garantías de rareza ni de composición, ni tasas de aparición: ninguna está verificada para estas ediciones.
 */
export const guarantees: Guarantee[] = datos.productos.map((p): Guarantee => ({
  id: `g-${p.id}-contenido`,
  scope: p.id,
  language: "zh",
  region: "CN",
  type: "physical_contents",
  quantityKind: "fixed",
  statement: p.tipo === "booster" ? `${p.contenido[0].quantity} cartas por sobre, al azar (cantidad leída en el envase). No indica qué cartas son ni su rareza.` : "Contenido físico según la ficha y las fotos del proveedor (detalle en la descripción de la ficha). Las cartas de los sobres vienen al azar y no se garantiza ninguna carta concreta ni rareza.",
  evidence: "seller_pack_contents",
  sourceIds: [sourceId(p.fuente)],
  reviewedAt: FECHA,
}));

for (const p of products) p.guaranteeIds = guarantees.filter((g) => g.scope === p.id).map((g) => g.id);

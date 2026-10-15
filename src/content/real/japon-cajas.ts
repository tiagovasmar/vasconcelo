import type { Expansion, Guarantee, ImageAsset, Product, Source } from "../schema";
import datos from "../colecciones/origen/japon-cajas.json";
import imagenes from "../colecciones/imagenes-japon-cajas.json";
import cajasCenter from "../colecciones/imagenes-cajas-center.json";
import cajasProveedor from "../colecciones/imagenes-cajas-proveedor.json";
import { buildCards } from "./expansions";
import { coverageOf, formatRanges } from "@/features/catalog/coverage";
import terastal from "../colecciones/cartas/terastal-festival-ex.json";
import ninja from "../colecciones/cartas/ninja-spinner.json";
import nihil from "../colecciones/cartas/nihil-zero.json";
import symphonia from "../colecciones/cartas/mega-symphonia.json";
import card151 from "../colecciones/cartas/pokemon-card-151.json";

type ListaOficial = Parameters<typeof buildCards>[2] & { searchGroup: number };
const listas: Record<string, ListaOficial> = {
  "terastal-festival-ex": terastal, "ninja-spinner": ninja, "nihil-zero": nihil,
  "mega-symphonia": symphonia, "pokemon-card-151": card151,
};
function galeria(c: Entrada): Pick<Expansion, "cards" | "cardListStatus" | "cardListNote" | "officialCardCount"> {
  const lista = listas[c.id];
  if (!lista) return { cards: [], cardListStatus: "unavailable", cardListNote: "Todavía no hay una lista de cartas cargada para esta expansión." };
  const cobertura = coverageOf(lista.cards.map((x) => x.number));
  return {
    cards: buildCards(c.id, c.nombre, lista),
    officialCardCount: lista.officialCount,
    cardListStatus: cobertura.status,
    cardListNote: `Fuente: buscador oficial japonés, consultado el ${lista.fetchedAt}: ${lista.cards.length} cartas. ${cobertura.status === "complete" ? "Numeración sin huecos." : `Números pendientes en la fuente: ${formatRanges(cobertura.missing)}.`} Las variantes de acabado no se listan por separado; las rarezas se toman del ícono oficial. Las imágenes muestran cartas posibles, sin garantizar su aparición en una caja.`,
  };
}

/**
 * Seis cajas japonesas agregadas el 14/10/2026 (Terastal Festival ex, Ninja Spinner, Nihil Zero, The Glory of Team Rocket, Mega Symphonia y
 * Pokémon Card 151). Se arman desde `origen/japon-cajas.json` (lo verificado, con su fuente) y `imagenes-japon-cajas.json` (fotos oficiales del sobre
 * optimizadas por `scripts/colecciones/importar-japon-cajas.mjs`).
 *
 * Reglas: una colección y una ficha de CAJA por entrada (sin sobres individuales); cinco listas importadas del buscador oficial japonés;
 * sin tasas ni rarezas garantizadas (solo lo que dice el envase del sobre, con su fuente); precio en USD y stock los carga el dueño en /admin
 * (el precio de lista de este lote entra por `npm run precios:cargar`) y el stock queda desconocido hasta que aporte una cantidad propia.
 * Cinco fichas tienen fotos oficiales de caja cerrada y exhibición abierta de Pokémon Center. 151 sigue usando el sobre.
 */
const FECHA = datos.consultado;
const LICENCIA = "Sin permiso de uso concedido por el enlace de origen. Foto de referencia del fabricante (sobre): no muestra la caja ni acredita el estado del inventario de la tienda.";
const CENTER_NOTE = "Los precios en yenes, sorteos, stock, fechas de envío, promociones y políticas de Pokémon Center NO son condiciones de esta tienda.";
const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} de ${meses[m - 1]} de ${y}`; };

type Entrada = (typeof datos.cajas)[number];
type Envase = { page: string; scope: string; clave: string; statement: string; quantityKind: "fixed" | "minimum" | "alternatives" };
const envaseDe = (c: Entrada): Envase | undefined => ("envase" in c ? (c.envase as Envase) : undefined);

export const sources: Source[] = datos.cajas.flatMap((c) => {
  const out: Source[] = [
    { id: `exp-${c.id}`, url: c.urlOficial, publisher: "Pokémon Card (sitio oficial, Japón)", consultedAt: FECHA, scope: `Página oficial de la expansión ${c.nombre} (${c.code}): nombre, fecha de lanzamiento, tipo de producto y cantidad de cartas por sobre.${"urlOficialNota" in c ? ` ${c.urlOficialNota}` : ""}` },
    { id: `box-${c.id}`, url: c.fuenteCaja.url, publisher: c.fuenteCaja.publisher, consultedAt: FECHA, scope: `Caja de ${c.nombre}: ${c.fuenteCaja.alcance}`, ...("nota" in c.fuenteCaja ? { note: `${(c.fuenteCaja as { nota: string }).nota}` } : c.fuenteCaja.publisher.startsWith("Pokémon Center") ? { note: CENTER_NOTE } : { note: "Fuente de un medio, no del fabricante: confirma la cantidad de sobres por caja, que la página oficial de la expansión no informa." }) },
  ];
  const e = envaseDe(c);
  const lista = listas[c.id];
  if (lista) out.push({ id: `cartas-${c.id}`, url: `https://www.pokemon-card.com/card-search/index.php?pg=${lista.searchGroup}&regulation_sidebar_form=all`, publisher: "Pokémon Card (buscador oficial, Japón)", consultedAt: lista.fetchedAt, scope: `Lista e imágenes de ${c.nombre} (${c.code}), grupo ${lista.searchGroup}: ${lista.officialCount} cartas; nombre, número y rareza según la fuente.` });
  const center = cajasCenter.find((i) => i.collectionId === c.id);
  if (center) out.push({ id: `fotos-caja-${c.id}`, url: center.sourcePage, publisher: "Pokémon Center Online (Japón)", consultedAt: center.reviewedAt, scope: `Fotos oficiales de la caja cerrada y de exhibición abierta de ${c.nombre} (${c.code}).`, note: CENTER_NOTE });
  if (e) out.push({ id: `envase-${c.id}`, url: e.page, publisher: "Pokémon Card (sitio oficial, Japón)", consultedAt: FECHA, scope: e.scope, note: "Texto leído en la imagen oficial del envase; no figura como texto en la página." });
  return out;
});

export const expansions: Expansion[] = datos.cajas.map((c): Expansion => ({
  id: c.id,
  slug: c.id,
  name: c.nombre,
  code: c.code,
  language: "ja",
  region: "JP",
  japaneseName: c.nombreJa,
  aliases: [...new Set([c.nombreOficialEn, c.nombreJa, c.code, `${c.nombre} caja`].filter((a) => a !== c.nombre))],
  series: c.serie,
  releaseDate: c.fecha,
  summary: `Expansión japonesa de ${c.serie} (${c.code}), lanzada el ${fechaLarga(c.fecha)}. Nombre original: ${c.nombreJa}. Tipo de producto: ${c.tipoSobre}.`,
  ...galeria(c),
  isDemo: false,
  sourceIds: [`exp-${c.id}`, `box-${c.id}`, ...(envaseDe(c) ? [`envase-${c.id}`] : []), ...(listas[c.id] ? [`cartas-${c.id}`] : []), ...(cajasCenter.some((i) => i.collectionId === c.id) ? [`fotos-caja-${c.id}`] : [])],
  tone: c.tono as Expansion["tone"],
}));

const imagenDe = (c: Entrada): ImageAsset => {
  const reg = imagenes.find((i) => i.collectionId === c.id);
  if (!reg) throw new Error(`Falta la imagen de ${c.id}: ejecutá node scripts/colecciones/importar-japon-cajas.mjs`);
  return { src: reg.src, alt: cajasCenter.some((i) => i.collectionId === c.id) || cajasProveedor.some((i) => i.collectionId === c.id) ? `Sobre de ${c.nombre} (${c.code}), foto oficial de referencia del fabricante.` : c.imagen.alt, width: reg.width, height: reg.height, status: "reference", source: "manufacturer", view: "front", opaque: !reg.hasAlpha, origin: reg.sourceUrl, license: `${LICENCIA} Archivo original: ${reg.sourceUrl}; ${reg.operacion}.` };
};

const fotosDe = (c: Entrada): ImageAsset[] => [
  ...cajasCenter.filter((i) => i.collectionId === c.id).sort((a, b) => (a.view === "closed" ? -1 : 1) - (b.view === "closed" ? -1 : 1)).map((i): ImageAsset => ({
    src: i.src, width: i.width, height: i.height, status: "reference", source: "manufacturer", view: i.view as "closed" | "display-open", opaque: !i.hasAlpha, origin: i.sourceUrl,
    alt: i.view === "closed" ? `Caja cerrada de ${c.nombre} (${c.code}), foto oficial de referencia del fabricante.` : `Caja de ${c.nombre} (${c.code}) abierta: presentación de exhibición del fabricante (no es el estado del artículo que se vende).`,
    license: `Sin permiso de uso concedido por el enlace de origen. Referencia del fabricante; no acredita el inventario de la tienda. ${i.operacion}`,
  })),
  // Foto real de la caja cerrada de un proveedor (captura aportada por el dueño): referencia, no es el stock de la tienda.
  ...cajasProveedor.filter((i) => i.collectionId === c.id).map((i): ImageAsset => ({
    src: i.src, width: i.width, height: i.height, status: "reference", source: "supplier", view: "closed", opaque: true, origin: i.fuente,
    alt: `Caja cerrada de ${c.nombre} (${c.code}) sostenida en la mano, foto de un proveedor: referencia, no es el estado del artículo que se vende.`,
    license: `Sin permiso de uso concedido por el origen. Foto de un proveedor suministrada por el dueño; no acredita el inventario de la tienda. Original conservado en ${i.original}; ${i.operacion}.`,
  })),
  imagenDe(c),
];

export const products: Product[] = datos.cajas.map((c): Product => {
  const total = c.sobresPorCaja * c.cartasPorSobre;
  const nombre = `${c.nombre} (${c.code})`;
  const e = envaseDe(c);
  return {
    id: `${c.id}-caja`,
    sku: c.sku,
    slug: `${c.id}-caja`,
    title: `${c.nombre} · Caja de ${c.sobresPorCaja} sobres`,
    kind: "box",
    language: "ja",
    region: "JP",
    aliases: [c.nombreJa, c.nombreOficialEn, c.code, c.nombre].filter((a, i, l) => l.indexOf(a) === i),
    expansionIds: [c.id],
    currency: "ARS",
    priceMinor: null,
    stockQuantity: null,
    ownerSealCondition: null,
    active: true,
    isDemo: false,
    rarityReview: {
      status: "not_documented",
      checkedAt: FECHA,
      sourceIds: [`exp-${c.id}`, `box-${c.id}`, ...(e ? [`envase-${c.id}`] : [])],
      note: `Revisadas la página oficial de la expansión (${c.code}), el texto del sobre y la fuente que informa la cantidad de sobres por caja: indican la cantidad de cartas por sobre y que son aleatorias${e ? `, y el texto del envase (${e.statement.split(".")[0].replace(/^Cada sobre incluye /, "")})` : ""}, sin declarar ninguna rareza (AR, SAR, SR…) garantizada por sobre ni por caja. No se trasladan garantías de otros productos, ediciones o regiones.`,
    },
    createdAt: c.fecha,
    images: fotosDe(c),
    fallbackTone: c.tono as Product["fallbackTone"],
    description: `Caja de ${c.sobresPorCaja} sobres de la expansión japonesa ${nombre} (${c.tipoSobre}). Cada sobre trae ${c.cartasPorSobre} cartas al azar: ${total} posiciones de carta por caja, que no implican cartas todas distintas ni la colección completa. Edición japonesa: no equivale a las versiones internacionales. ${cajasCenter.some((i) => i.collectionId === c.id) ? "Las fotos oficiales muestran la caja cerrada, la presentación de exhibición abierta y el sobre; no acreditan el estado ni el sellado del stock de la tienda." : cajasProveedor.some((i) => i.collectionId === c.id) ? "La foto de la caja cerrada es de un proveedor y la del sobre es oficial; ninguna acredita el estado ni el sellado del stock de la tienda. Todavía no hay una foto oficial de la caja." : "La foto es la del sobre oficial de la expansión; la foto de la caja cerrada todavía está pendiente."}`,
    contents: [
      { label: "Sobres por caja", quantity: c.sobresPorCaja, unit: "sobres" },
      { label: "Cartas por sobre", quantity: c.cartasPorSobre, unit: "cartas" },
      { label: "Posiciones de carta por caja", quantity: total, unit: "cartas", note: "Al azar: no son cartas todas distintas ni la colección completa." },
    ],
    guaranteeIds: [], // se completan abajo
  };
});

/** Contenido físico (sobres por caja y cartas por sobre) y, solo donde el envase lo dice, la composición por sobre. Sin garantías de rareza ni tasas. */
export const guarantees: Guarantee[] = datos.cajas.flatMap((c): Guarantee[] => {
  const base = { scope: `${c.id}-caja`, language: "ja" as const, region: "JP", evidence: "official" as const, reviewedAt: FECHA };
  const list: Guarantee[] = [
    { ...base, id: `g-${c.id}-caja-contenido`, type: "physical_contents", quantityKind: "fixed", statement: `${c.sobresPorCaja} sobres por caja, de ${c.cartasPorSobre} cartas cada uno (${c.sobresPorCaja * c.cartasPorSobre} posiciones de carta). Las cartas vienen al azar: no implica cartas todas distintas.`, sourceIds: [`exp-${c.id}`, `box-${c.id}`] },
  ];
  const e = envaseDe(c);
  if (e) list.push({ ...base, id: `g-${c.id}-caja-${e.clave}`, type: "composition", quantityKind: e.quantityKind, statement: e.statement.replace(/^Cada sobre incluye/, "Cada sobre de la caja incluye"), sourceIds: [`envase-${c.id}`, `exp-${c.id}`] });
  return list;
});

for (const p of products) p.guaranteeIds = guarantees.filter((g) => g.scope === p.id).map((g) => g.id);

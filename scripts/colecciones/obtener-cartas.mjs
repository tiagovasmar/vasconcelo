// Obtiene la lista de cartas de cada colección desde el BUSCADOR OFICIAL de cartas (pokemon-card.com), de forma acotada:
//  · una petición a la vez (con pausa), identificándose con un User-Agent propio, con reintentos y sin concurrencia masiva;
//  · caché en .local/cache/colecciones (ignorada por Git): lo ya descargado no se vuelve a pedir, ni en builds ni al repetir;
//  · el resultado procesado (nombre oficial, número, rareza) queda en src/content/colecciones/cartas/<id>.json, versionado.
// Uso:  node scripts/colecciones/obtener-cartas.mjs [id-de-coleccion ...]     (sin argumentos: las ocho)
//       FORZAR=1 para ignorar la caché.
import fs from "node:fs";
import path from "node:path";
import { COLECCIONES } from "./config.mjs";

const BASE = "https://www.pokemon-card.com";
const UA = "TiendaPokemonLocal/1.0 (importacion acotada y con cache de metadatos publicos; una peticion a la vez)";
const PAUSA_MS = Number(process.env.PAUSA_MS ?? 350);
const CACHE = path.resolve(".local/cache/colecciones");
const OUT = path.resolve("src/content/colecciones/cartas");
fs.mkdirSync(path.join(CACHE, "detalles"), { recursive: true });
fs.mkdirSync(path.join(CACHE, "listas"), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ultima = 0;
async function pedir(url) {
  for (let intento = 1; intento <= 4; intento++) {
    const espera = ultima + PAUSA_MS - Date.now();
    if (espera > 0) await sleep(espera);
    ultima = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(40_000) });
      if (res.ok) return await res.text();
      if (res.status === 404) throw new Error("404");
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (String(e.message) === "404" || /HTTP 4/.test(String(e.message))) throw e;
    }
    await sleep(1500 * intento); // reintento con espera creciente
  }
  throw new Error(`Sin respuesta tras 4 intentos: ${url}`);
}

const forzar = process.env.FORZAR === "1";
async function conCache(file, url) {
  if (!forzar && fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const body = await pedir(url);
  fs.writeFileSync(file, body);
  return body;
}

const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
function parseDetalle(html) {
  const marca = html.match(/regulation_logo_\d+\/([A-Za-z0-9_-]+)\.gif/)?.[1] ?? null;
  const num = html.match(/&nbsp;(\d+)&nbsp;\/&nbsp;(\d+)&nbsp;/);
  const rareza = html.match(/card\/rarity\/(ic_rare_[A-Za-z0-9_]+)\.gif/)?.[1] ?? null;
  const tipo = decode(html.match(/<h4>([^<]*)<\/h4>/)?.[1] ?? "");
  return { setMark: marca, number: num ? num[1] : null, total: num ? num[2] : null, rarityIcon: rareza, kind: tipo || null };
}

const pedidos = process.argv.slice(2);
const sets = COLECCIONES.filter((c) => pedidos.length === 0 || pedidos.includes(c.id));
const resumen = [];
for (const c of sets) {
  console.log(`\n== ${c.id} (pg=${c.pg})`);
  // 1) lista oficial paginada
  const lista = [];
  let pagina = 1;
  let maxPagina = 1;
  let hitCnt = 0;
  let condicion = [];
  do {
    const url = `${BASE}/card-search/resultAPI.php?keyword=&se_ta=&regulation_sidebar_form=all&pg=${c.pg}&illust=&sm_and_keyword=true&page=${pagina}`;
    const json = JSON.parse(await conCache(path.join(CACHE, "listas", `${c.id}-p${pagina}.json`), url));
    if (json.result !== 1) throw new Error(`${c.id}: respuesta inválida del buscador (${json.errMsg})`);
    maxPagina = json.maxPage;
    hitCnt = json.hitCnt;
    condicion = json.searchCondition;
    // Guarda contra un código de grupo equivocado: el título oficial debe contener el nombre esperado.
    if (!condicion.join(" ").normalize("NFKC").includes(c.nombreEnBuscador.normalize("NFKC"))) throw new Error(`${c.id}: pg=${c.pg} corresponde a «${condicion[0]}», no a «${c.nombreEnBuscador}»`);
    lista.push(...json.cardList);
    pagina++;
  } while (pagina <= maxPagina);
  if (lista.length !== hitCnt) throw new Error(`${c.id}: se leyeron ${lista.length} cartas pero el buscador informa ${hitCnt}`);
  console.log(`   lista: ${lista.length} cartas (${condicion[0]})`);

  // 2) detalle de cada carta (número y rareza)
  const cartas = [];
  const fallos = [];
  for (const [i, item] of lista.entries()) {
    try {
      const html = await conCache(path.join(CACHE, "detalles", `${item.cardID}.html`), `${BASE}/card-search/details.php/card/${item.cardID}/regu/all`);
      cartas.push({ cardId: item.cardID, name: item.cardNameViewText || item.cardNameAltText, thumb: item.cardThumbFile, ...parseDetalle(html) });
    } catch (e) {
      fallos.push({ cardId: item.cardID, error: String(e.message) });
      cartas.push({ cardId: item.cardID, name: item.cardNameViewText || item.cardNameAltText, thumb: item.cardThumbFile, setMark: null, number: null, total: null, rarityIcon: null, kind: null });
    }
    if ((i + 1) % 25 === 0) console.log(`   detalle ${i + 1}/${lista.length}`);
  }
  fs.writeFileSync(
    path.join(OUT, `${c.id}.json`),
    JSON.stringify({ collectionId: c.id, searchGroup: c.pg, searchTitle: condicion[0], officialCount: hitCnt, fetchedAt: new Date().toISOString().slice(0, 10), source: `${BASE}/card-search/index.php`, cards: cartas }, null, 1) + "\n",
  );
  resumen.push({ id: c.id, oficial: hitCnt, cartas: cartas.length, sinNumero: cartas.filter((x) => !x.number).length, sinRareza: cartas.filter((x) => !x.rarityIcon).length, fallos: fallos.length });
}
console.table(resumen);
if (resumen.some((r) => r.fallos)) process.exitCode = 1;

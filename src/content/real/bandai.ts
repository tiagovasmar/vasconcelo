import { gameLabel } from "../games";
import type { Product, Source } from "../schema";

export const sources: Source[] = [
  { id: "bandai-op-jp", publisher: "Bandai · One Piece Card Game", url: "https://en.onepiece-cardgame.com/products/?subcategory=boosters", consultedAt: "2026-11-08", scope: "Nombres de las expansiones de One Piece Card Game. El formato y la edición japonesa se leen del envase de referencia." },
  { id: "bandai-op-cn", publisher: "Bandai · 航海王卡牌对战", url: "https://www.onepiece-cardgame.cn/cardlist/", consultedAt: "2026-11-08", scope: "Nombres y códigos de la edición china de One Piece Card Game." },
  { id: "bandai-op-cn-opc09", publisher: "Bandai China", url: "https://www.onepiece-cardgame.cn/op09", consultedAt: "2026-11-09", scope: "OPC-09 en chino simplificado: 6 cartas por sobre." },
  { id: "bandai-op-cn-opc10", publisher: "Bandai China", url: "https://www.onepiece-cardgame.cn/products/detail?id=75&type=2", consultedAt: "2026-11-09", scope: "OPC-10 en chino simplificado: 6 cartas por sobre." },
  { id: "bandai-op-cn-opc12", publisher: "Bandai China", url: "https://www.onepiece-cardgame.cn/products/detail?id=97&type=1", consultedAt: "2026-11-09", scope: "OPC-12 en chino simplificado: 6 cartas por sobre." },
  { id: "bandai-op-jp-op17", publisher: "Bandai Japón", url: "https://cp.onepiece-cardgame.com/flame-flame-fruit/goods", consultedAt: "2026-11-09", scope: "OP-17 en japonés: 24 sobres de 6 cartas por caja." },
  { id: "op-cn-prbc02-box", publisher: "PokeUnlimited", url: "https://pokeunlimited.com/products/one-piece-card-game-the-best-vol-2-prbc-02-premium-booster-box-simplified-chinese", consultedAt: "2026-11-09", scope: "Ficha comercial del exhibidor PRBC-02 chino: 10 sobres de 10 cartas." },
  { id: "op-cn-opc09-box", publisher: "PokémonCard.com.cn (tienda)", url: "https://www.pokemoncard.com.cn/products/one-piece-tcg-simplified-chinese-opc-09-booster-box-new-emperors-arrival-bandai-new-sealed", consultedAt: "2026-11-09", scope: "Ficha comercial de la caja estándar OPC-09 de 24 sobres." },
  { id: "op-cn-opc12-box", publisher: "Pocket Collection", url: "https://pocketcollection.ca/products/one-piece-opc-12-legacy-of-the-master-booster-box-simplified-chinese", consultedAt: "2026-11-09", scope: "Ficha comercial de la caja estándar OPC-12 de 24 sobres." },
  { id: "bandai-db-jp", publisher: "Bandai · Dragon Ball Super Card Game Fusion World", url: "https://www.dbs-cardgame.com/fw/en/products/?tags=all", consultedAt: "2026-11-08", scope: "Nombres de las colecciones y los mazos de Fusion World. Para el contenido se toma el envase japonés de referencia." },
  { id: "bandai-db-decks-jp", publisher: "Bandai Japón · Fusion World", url: "https://www.dbs-cardgame.com/fw/jp/products/?tags=StarterDecks", consultedAt: "2026-11-08", scope: "Catálogo japonés de mazos iniciales y contenido de cada referencia." },
];

type Variant = {
  code: string;
  name: string;
  original?: string;
  format?: "booster" | "kit";
  packs?: number;
  cards?: number;
  open?: boolean;
  references?: string[];
  vendorLabel?: string;
};

const chineseOnePiece: Variant[] = [
  { code: "PRBC-02", name: "The Best Vol. 2", original: "历代典藏合集2", packs: 10, cards: 10, references: ["op-cn-prbc02-box"] },
  { code: "OPC-09", name: "Emperors in the New World", original: "新帝降临", packs: 24, cards: 6, references: ["bandai-op-cn-opc09", "op-cn-opc09-box"] },
  { code: "OPC-10", name: "Royal Blood", original: "王之血脉", format: "booster", cards: 6, references: ["bandai-op-cn-opc10"] },
  { code: "OPC-12", name: "Legacy of the Master", original: "师徒之绊", packs: 24, cards: 6, references: ["bandai-op-cn-opc12", "op-cn-opc12-box"] },
  { code: "OPC-14", name: "The Azure Sea’s Seven", original: "苍海七杰", packs: 24, cards: 6 },
];

const japaneseOnePiece: Variant[] = [
  { code: "OP-05", name: "Awakening of the New Era", original: "新時代の主役", packs: 24, cards: 6, open: true },
  { code: "OP-07", name: "500 Years in the Future", original: "500年後の未来", packs: 24, cards: 6 },
  { code: "OP-08", name: "Two Legends", original: "二つの伝説", packs: 24, cards: 6, vendorLabel: "OPC-08" },
  { code: "OP-09", name: "Emperors in the New World", original: "新たなる皇帝", packs: 24, cards: 6 },
  { code: "OP-10", name: "Royal Blood", original: "王族の血統", packs: 24, cards: 6, open: true },
  { code: "OP-11", name: "A Fist of Divine Speed", original: "神速の拳", packs: 24, cards: 6 },
  { code: "OP-13", name: "Carrying on His Will", original: "受け継がれる意志", packs: 24, cards: 6, open: true },
  { code: "OP-17", name: "The World’s Strongest Warriors", original: "世界最強の戦士", packs: 24, cards: 6, references: ["bandai-op-jp-op17"], vendorLabel: "OPC-17" },
  { code: "EB-05", name: "Heroines Edition Vol. 2", packs: 24, cards: 6, vendorLabel: "EBC-05" },
];

const dragonBall: Variant[] = [
  { code: "FB01", name: "Awakened Pulse", original: "覚醒の鼓動" },
  { code: "FB02", name: "Blazing Aura", original: "烈火の闘気" },
  { code: "FB03", name: "Raging Roar", original: "怒りの咆哮" },
  { code: "FB04", name: "Ultra Limit", original: "限界を超えし者" },
  { code: "FB05", name: "New Adventure", original: "未知なる冒険" },
  { code: "FB08", name: "Saiyan’s Pride", original: "誇り高き戦闘民族" },
  { code: "FB09", name: "Dual Evolution" },
  { code: "FB10", name: "Cross Force", format: "booster", cards: 6 },
  { code: "FS01", name: "Son Goku", original: "孫悟空", format: "kit" },
  { code: "FS02", name: "Vegeta", original: "ベジータ", format: "kit" },
  { code: "FS04", name: "Frieza", original: "フリーザ", format: "kit" },
  { code: "FS05", name: "Bardock", original: "バーダック", format: "kit" },
  { code: "FS08", name: "Vegeta (Mini) Super Saiyan 3", original: "ベジータ（ミニ）超サイヤ人3", format: "kit" },
];

const coverPhotos: Record<string, { width: number; height: number; origin?: string; manufacturer?: boolean }> = {
  "one-piece-op-08-ja": { width: 639, height: 1050, origin: "https://pullhousestore.com/products/op-08-booster-box-one-piece-two-legends-japanese" },
  "one-piece-eb-05-ja": { width: 618, height: 1022, origin: "https://soundfamilycollectibles.com/products/one-piece-eb-05-heroines-edition-vol-2-japanese-booster-box" },
  "one-piece-op-17-ja": { width: 511, height: 844, origin: "https://cp.onepiece-cardgame.com/flame-flame-fruit/goods", manufacturer: true },
  "dragon-ball-fb09-ja": { width: 362, height: 600, origin: "https://fandom.tokyo/ja/products/dragon-ball-tcg-fusion-world-dual-evolution-fb-09-japanese-booster-box" },
  "dragon-ball-fb10-ja": { width: 201, height: 400, origin: "https://www.dbs-cardgame.com/fw/jp/products/01_400.html", manufacturer: true },
  "dragon-ball-fs01-ja": { width: 236, height: 400, origin: "https://www.dbs-cardgame.com/fw/jp/products/01_1.html", manufacturer: true },
  "dragon-ball-fs02-ja": { width: 236, height: 400, origin: "https://www.dbs-cardgame.com/fw/jp/products/01_2.html", manufacturer: true },
  "dragon-ball-fs04-ja": { width: 236, height: 400, origin: "https://www.dbs-cardgame.com/fw/jp/products/01_4.html", manufacturer: true },
  "dragon-ball-fs05-ja": { width: 237, height: 400, origin: "https://www.dbs-cardgame.com/fw/jp/products/01_54.html", manufacturer: true },
  "dragon-ball-fs08-ja": { width: 236, height: 400, origin: "https://www.dbs-cardgame.com/fw/jp/products/01_160.html", manufacturer: true },
  "one-piece-prbc-02-zh": { width: 363, height: 624 },
  "one-piece-opc-09-zh": { width: 378, height: 623 },
  "one-piece-opc-10-zh": { width: 297, height: 603 },
  "one-piece-opc-12-zh": { width: 374, height: 625 },
  "one-piece-opc-14-zh": { width: 369, height: 617 },
  "one-piece-op-13-ja": { width: 491, height: 1050 },
  "one-piece-op-11-ja": { width: 363, height: 601 },
  "one-piece-op-10-ja": { width: 295, height: 632 },
  "one-piece-op-09-ja": { width: 384, height: 638 },
  "one-piece-op-07-ja": { width: 633, height: 1050 },
  "one-piece-op-05-ja": { width: 305, height: 654 },
  "dragon-ball-fb01-ja": { width: 481, height: 797 },
  "dragon-ball-fb02-ja": { width: 481, height: 797 },
  "dragon-ball-fb03-ja": { width: 481, height: 797 },
  "dragon-ball-fb04-ja": { width: 481, height: 797 },
};

function product(variant: Variant, game: "one-piece" | "dragon-ball", language: "ja" | "zh", sourceId: string): Product {
  const { code, name, original, open, vendorLabel, references = [] } = variant;
  const kind = variant.format ?? "box";
  const packs = variant.packs ?? (game === "dragon-ball" && kind === "box" ? 24 : undefined);
  const cards = variant.cards ?? (game === "dragon-ball" && kind === "box" ? 6 : undefined);
  const edition = language === "ja" ? "en japonés" : "en chino simplificado";
  const formatName = kind === "kit" ? "Mazo inicial" : kind === "booster" ? "Sobre individual" : packs ? `Caja de ${packs} sobres` : "Caja de sobres";
  const title = `${name} (${code}) · ${formatName}`;
  const slug = `${game}-${code.toLowerCase()}-${language}`;
  const cover = coverPhotos[slug];
  const series = game === "dragon-ball" ? "Dragon Ball Super Card Game: Fusion World" : "One Piece Card Game";
  const contents: Product["contents"] = kind === "kit"
    ? [
        { label: "Mazo prearmado de 51 cartas", quantity: 1 },
        { label: "Sobre de bonificación", quantity: 1 },
        { label: "Marcador de energía", quantity: 1 },
        { label: "Hoja de juego y reglas", quantity: 1 },
        { label: "Código para la versión digital", quantity: 1 },
      ]
    : [
        { label: kind === "booster" ? "Sobre" : "Sobres por caja", quantity: kind === "booster" ? 1 : packs, unit: kind === "box" && packs ? "sobres" : undefined },
        { label: "Cartas por sobre", quantity: cards, unit: cards ? "cartas" : undefined, note: cards ? "Al azar." : "Cantidad a confirmar para esta edición." },
      ];
  const detail = kind === "kit" ? "Incluye un mazo prearmado de 51 cartas y un sobre de bonificación."
    : cards ? `Cada sobre contiene ${cards} cartas aleatorias${packs ? ` (${packs * cards} cartas en los sobres de la caja)` : ""}.`
    : "La cantidad de cartas por sobre está a confirmar para esta edición.";

  return {
    id: slug, slug, sku: `${game.toUpperCase()}-${code}-${language === "ja" ? "JP" : "CN"}`,
    game, title, kind, language, region: language === "ja" ? "JP" : "CN", originalTitle: original,
    aliases: [gameLabel[game], code.replaceAll("-", ""), ...(vendorLabel ? [vendorLabel] : [])],
    nameInfo: { kind: language === "zh" ? "descriptive" : "official", certainty: language === "zh" ? "variants" : "sources_agree", variants: [], sourceIds: [sourceId, ...references, ...(kind === "kit" ? ["bandai-db-decks-jp"] : [])], verifiedAt: "2026-11-09" },
    expansionIds: [], currency: "ARS", priceUsdMinor: null, priceMinor: null, stockQuantity: 0, orderOnly: true,
    active: true, isDemo: false, createdAt: "2026-11-08", fallbackTone: "paper",
    images: [{
      src: `/images/products/${slug}/${cover ? "envase-v2.webp" : "referencia.webp"}`,
      alt: `${formatName} de ${name} (${code})${open ? ", vista de exhibición" : ""}`,
      width: cover?.width ?? 720,
      height: cover?.height ?? 900,
      opaque: false,
      status: "reference",
      source: cover?.manufacturer ? "manufacturer" : "supplier",
      view: kind === "box" ? (open ? "display-open" : "closed") : "front",
      origin: cover?.origin ?? "Imagen de la publicación de Taobao aportada por el dueño el 8 de noviembre de 2026, recortada para el catálogo.",
      license: cover?.manufacturer ? "Imagen de referencia publicada por Bandai." : "Imagen de referencia del producto publicada por el proveedor.",
    }],
    description: `${formatName} de ${series}, edición ${edition}. ${detail}${open ? " La imagen muestra la caja abierta en exhibición." : ""}${vendorLabel && !cover?.origin ? " La foto conserva el rótulo del proveedor. Al cotizar el encargo se confirma el idioma de la unidad ofrecida." : ""}`,
    contents, guaranteeIds: [],
  };
}

export const products = [
  ...chineseOnePiece.map((variant) => product(variant, "one-piece", "zh", "bandai-op-cn")),
  ...japaneseOnePiece.map((variant) => product(variant, "one-piece", "ja", "bandai-op-jp")),
  ...dragonBall.map((variant) => product(variant, "dragon-ball", "ja", "bandai-db-jp")),
];

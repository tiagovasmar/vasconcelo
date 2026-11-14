import type { Product } from "../schema";

const china = "https://www.pokemon.cn";
export const chinesePhotoEditions: Record<string, { code: string; officialUrl: string; pack: string }> = {
  "zh-black-bolt": { code: "csv10.5c", officialUrl: `${china}/tcg/product/21905.html`, pack: "Cada sobre Slim trae 5 cartas al azar, incluida 1 brillante." },
  "zh-white-flare": { code: "csv10.6c", officialUrl: `${china}/tcg/product/21905.html`, pack: "Cada sobre Slim trae 5 cartas al azar, incluida 1 brillante." },
  "zh-baoshibao-vol6": { code: "cbb6c", officialUrl: `${china}/products_category/products/p/12`, pack: "Cada sobre trae 4 cartas al azar." },
  "zh-taijing-shengju": { code: "csv9.5c", officialUrl: `${china}/tcg/product/21997.html`, pack: "Cada sobre trae 10 cartas al azar, con 3 o 4 brillantes según Pokémon China." },
  "zh-xingcai-jingli": { code: "csv9c", officialUrl: `${china}/tcg/product/21383.html`, pack: "Cada sobre de 5 cartas incluye 1 brillante según Pokémon China." },
};
const chineseSetLists: Record<string, string> = {
  "zh-gongzhu-rongguang": "csv10c", "zh-xingcai-jingli": "csv9c", "zh-cuican-guihuan": "csv8c",
  "zh-zhenshi-xuanxu": "csv6c", "zh-liren-mengxing": "csv7c", "zh-jiajiang-huihe": "csv4c",
  "zh-heijing-chicheng": "csv5c", "zh-wuwei-taijing": "csv3c", "zh-gengu-kailai": "csv1c",
};
const chineseSets: Record<string, { path: string; cards?: string[] }> = {
  "zh-gongzhu-rongguang": { path: "/tcg/event/22742.html" },
  "zh-xingcai-jingli": { path: "/tcg/product/21383.html", cards: ["Pokémon ex Teracristal de tipo Astral", "Cartas ACE SPEC"] },
  "zh-cuican-guihuan": { path: "/tcg/product/20627.html", cards: ["Ogerpon ex en cuatro formas", "Cartas ACE SPEC"] },
  "zh-zhenshi-xuanxu": { path: "/tcg/17555.html", cards: ["Pokémon del pasado y del futuro", "Cartas con ilustración AR, SR, SAR y UR"] },
  "zh-liren-mengxing": { path: "/tcg/product/19812.html", cards: ["Greninja ex Teracristal", "Cartas ACE SPEC"] },
  "zh-jiajiang-huihe": { path: "/tcg/product/15482.html", cards: ["Arboliva", "Máquinas Técnicas", "Energía Jet"] },
  "zh-heijing-chicheng": { path: "/tcg/product/15448.html", cards: ["Pokémon ex de Paldea"] },
  "zh-wuwei-taijing": { path: "/tcg/product/15514.html", cards: ["Frigibax", "Arctibax", "Baxcalibur"] },
  "zh-gengu-kailai": { path: "/tcg/product/15585.html", cards: ["Miraidon ex", "Koraidon ex", "Absol ex", "Tinkaton ex"] },
  "zh-nuyan-zhuotian": { path: "/tcg/product/15992.html", cards: ["Kricketune V", "Empoleon V", "Emboar", "Inteleon"] },
  "zh-anying-duohui": { path: "/tcg/product/15767.html", cards: ["Charizard Radiante", "Blastoise Radiante", "Regigigas"] },
  "zh-jiju-gongfang": { path: "/tcg/product/16208.html", cards: ["Dragapult V", "Dragapult VMAX", "Vikavolt V"] },
};

export function productCardReference(product: Product) {
  const expansion = product.expansionIds.length === 1 ? product.expansionIds[0] : "";
  const source = chineseSets[expansion];
  const setList = chineseSetLists[expansion];
  if (source) return { url: china + source.path, publisher: "Pokémon China", cards: source.cards,
    catalogUrl: setList ? `https://pikaqian.com/sets/${setList}` : undefined };
  if (product.game === "one-piece") {
    const code = /^ONE-PIECE-(OP|EB)-(\d{2})-JP$/.exec(product.sku);
    return product.language === "zh"
      ? { url: "https://www.onepiece-cardgame.cn/cardlist/", publisher: "Bandai China" }
      : { url: `https://www.onepiece-cardgame.com/cardlist/${code ? `?series=550${code[1] === "OP" ? 1 : 2}${code[2]}` : ""}`, publisher: "Bandai Japón" };
  }
  if (product.game === "dragon-ball") {
    const code = /^DRAGON-BALL-(FB|FS)(\d{2})-JP$/.exec(product.sku);
    return {
      url: `https://www.dbs-cardgame.com/fw/jp/cardlist/${code ? `?category%5B0%5D=584${code[1] === "FB" ? 0 : 1}${code[2]}&search=true` : ""}`,
      publisher: "Bandai Japón",
    };
  }
}

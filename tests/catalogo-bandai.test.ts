import path from "node:path";
import sharp from "sharp";
import { expect, it } from "vitest";
import { realCatalog } from "@/content/catalog";
import { catalogHref, parseGame } from "@/content/games";
import { isListedProduct } from "@/features/catalog/visibility";

const bandai = realCatalog.products.filter((product) => product.game === "one-piece" || product.game === "dragon-ball");

it("mantiene separadas las ediciones y ofrece las tres variantes japonesas por encargo", () => {
  expect(bandai.filter((product) => product.game === "dragon-ball")).toHaveLength(13);
  expect(bandai.filter((product) => product.game === "one-piece" && isListedProduct(product))).toHaveLength(14);
  for (const code of ["op-08", "op-17", "eb-05"]) {
    expect(bandai.find((product) => product.slug === `one-piece-${code}-ja`)).toMatchObject({ active: true, language: "ja", region: "JP", orderOnly: true });
  }
  expect(bandai.filter((product) => product.title.startsWith("Emperors in the New World")).map((product) => product.language).sort()).toEqual(["ja", "zh"]);
  expect(bandai.find((product) => product.slug === "one-piece-opc-10-zh")?.kind).toBe("booster");
  expect(bandai.find((product) => product.slug === "dragon-ball-fb10-ja")?.kind).toBe("booster");
  expect(bandai.every((product) => product.orderOnly && product.priceUsdMinor === null && product.stockQuantity === 0)).toBe(true);
});

it("declara sobres y cartas por sobre en las cajas publicadas de los tres juegos", () => {
  const boxes = realCatalog.products.filter((product) => product.kind === "box" && isListedProduct(product));
  for (const box of boxes) {
    expect(box.contents.find((item) => item.label === "Sobres por caja")?.quantity, box.slug).toBeGreaterThan(0);
    expect(box.contents.find((item) => item.label === "Cartas por sobre")?.quantity, box.slug).toBeGreaterThan(0);
    expect(box.description, box.slug).not.toMatch(/cantidad de sobres a confirmar|cantidad de sobres por caja no figura/i);
  }
});

it("usa portadas con transparencia y dimensiones consistentes", async () => {
  await Promise.all(bandai.map(async (product) => {
    const cover = product.images[0];
    const file = path.join(process.cwd(), "public", cover.src.slice(1));
    const metadata = await sharp(file).metadata();
    expect(metadata, product.id).toMatchObject({ width: cover.width, height: cover.height, format: "webp", hasAlpha: true });
  }));
});

it("mantiene Pokémon como destino principal y conserva los filtros de cada juego", () => {
  expect(catalogHref(parseGame(undefined))).toBe("/sellados");
  expect(catalogHref(parseGame("dragon-ball"), new URLSearchParams({ pagina: "2" }))).toBe("/sellados?pagina=2&juego=dragon-ball");
});

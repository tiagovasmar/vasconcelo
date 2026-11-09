import type { WholesaleRow } from "./calc";
import { baseTier, hasBasePrice } from "./calc";
export { baseTier } from "./calc";
import type { EffectiveRate } from "@/features/fx/convert";
import { formatUSD } from "@/features/fx/convert";
import { languageLabel } from "@/content/labels";
import type { Language } from "@/content/schema";

export type CatalogExport = { rows: WholesaleRow[]; fx: EffectiveRate; generatedAt: number; minBoxes?: number | null };
export const exportDate = (time: number) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).format(time);
export function exportPages(rows: WholesaleRow[]) {
  rows = rows.filter(hasBasePrice);
  const pages: WholesaleRow[][] = [];
  for (let i = 0; i < rows.length; i += 6) pages.push(rows.slice(i, i + 6));
  return pages;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, maxLines: number, lineHeight: number) {
  const words = text.split(/\s+/);
  let lines = 0;
  for (let n = 0; words.length && n < maxLines; n++) {
    let line = words.shift()!;
    while (words.length && ctx.measureText(`${line} ${words[0]}`).width <= width) line += ` ${words.shift()}`;
    if (n === maxLines - 1 && words.length) line += "…";
    while (ctx.measureText(line).width > width && line.length > 1) line = line.slice(0, -2) + "…";
    ctx.fillText(line, x, y + n * lineHeight);
    lines++;
  }
  return lines;
}

/** Se pinta sobre fotos y textos y se incorpora al PNG/PDF, no como capa removible de HTML. */
function watermark(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(540, 780); ctx.rotate(-Math.PI / 6);
  ctx.font = "bold 76px Figtree, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(12,62,50,0.13)";
  ctx.strokeStyle = "rgba(255,255,255,0.20)"; ctx.lineWidth = 1.5;
  for (let y = -1400; y <= 1400; y += 270) {
    for (let x = -1500; x <= 1500; x += 820) {
      ctx.strokeText("VASCONCELO TCG", x, y);
      ctx.fillText("VASCONCELO TCG", x, y);
    }
  }
  ctx.restore();
}

async function productImage(src: string): Promise<HTMLImageElement | null> {
  // Siempre pasa por el optimizador del mismo origen: evita un canvas contaminado por CORS.
  return new Promise((resolve) => {
    const img = new Image();
    const timeout = window.setTimeout(() => { img.src = ""; resolve(null); }, 15000);
    img.onload = () => { clearTimeout(timeout); resolve(img); };
    img.onerror = () => { clearTimeout(timeout); resolve(null); };
    img.src = `/_next/image?url=${encodeURIComponent(src)}&w=640&q=75`;
  });
}

export async function renderCatalogImages(data: CatalogExport): Promise<{ blobs: Blob[]; missing: number }> {
  const pages = exportPages(data.rows);
  const blobs: Blob[] = [];
  let missing = 0;
  await document.fonts.ready;
  for (const [pageIndex, rows] of pages.entries()) {
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1560;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Tu navegador no permite generar la imagen.");
    ctx.fillStyle = "#f7f5ef"; ctx.fillRect(0, 0, 1080, 1560);
    ctx.fillStyle = "#0c3e32"; ctx.fillRect(0, 0, 1080, 270);
    ctx.fillStyle = "#fff"; ctx.font = "italic 54px Anton, sans-serif";
    ctx.fillText("VASCONCELO", 48, 82);
    ctx.font = "bold 27px Figtree, sans-serif"; ctx.fillText("TCG · CATÁLOGO MAYORISTA", 48, 126);
    ctx.fillStyle = "#e1c47b"; ctx.font = "24px Figtree, sans-serif";
    ctx.fillText(`Precios base en USD · Creado el ${exportDate(data.generatedAt)}`, 48, 172);
    ctx.font = "20px Figtree, sans-serif";
    const fx = data.fx;
    const rate = fx.rate10k ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(fx.rate10k / 10000) : null;
    ctx.fillText(rate ? `Referencia: USD 1 = ARS ${rate}${fx.mode === "manual" ? " · manual" : " · blue venta"}` : "Cotización ARS no disponible · precios expresados en USD", 48, 207);
    ctx.font = "17px Figtree, sans-serif";
    if (rate && fx.asOf) ctx.fillText(`Cotización del ${exportDate(fx.asOf)}${fx.warn ? " · actualización pendiente" : ""}`, 48, 232);
    ctx.fillStyle = "#fff"; ctx.font = "bold 20px Figtree, sans-serif";
    if (data.minBoxes) ctx.fillText(`Compra mínima mayorista: ${data.minBoxes} cajas en total`, 48, 258);
    const images = await Promise.all(rows.map((r) => r.image ? productImage(r.image.src) : null));
    rows.forEach((row, i) => {
      const x = 40 + (i % 2) * 510, y = 294 + Math.floor(i / 2) * 372;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(x, y, 490, 360, 16); ctx.fill();
      const img = images[i];
      if (img) {
        const scale = Math.min(420 / img.naturalWidth, 204 / img.naturalHeight);
        const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
        ctx.drawImage(img, x + (490 - w) / 2, y + 14 + (204 - h) / 2, w, h);
      } else {
        missing++; ctx.fillStyle = "#626763"; ctx.font = "22px Figtree, sans-serif"; ctx.fillText("Foto no disponible", x + 125, y + 125);
      }
      ctx.fillStyle = "#505852"; ctx.font = "16px Figtree, sans-serif";
      ctx.fillText(languageLabel[row.language as Language] ?? row.language, x + 20, y + 227);
      ctx.fillStyle = "#111915"; ctx.font = "bold 24px Figtree, sans-serif";
      const titleLines = wrap(ctx, row.title, x + 20, y + 248, 450, 2, 28);
      const priceY = y + 248 + (titleLines - 1) * 28 + 38;
      const tier = baseTier(row);
      ctx.fillStyle = "#0c3e32"; ctx.font = "bold 35px Figtree, sans-serif";
      ctx.fillText(tier ? formatUSD(tier.unitUsdMinor) : "A cotizar", x + 20, priceY);
      ctx.fillStyle = "#505852"; ctx.font = "18px Figtree, sans-serif";
      ctx.fillText(tier ? `c/u · desde ${tier.minQty} ${row.kind === "box" ? (tier.minQty === 1 ? "caja" : "cajas") : (tier.minQty === 1 ? "unidad" : "unidades")}` : "Precio pendiente de confirmación", x + 20, priceY + 26);
    });
    ctx.fillStyle = "#263f34"; ctx.font = "20px Figtree, sans-serif";
    ctx.fillText(`Exclusivamente por pedido${data.minBoxes ? ` · compra mínima: ${data.minBoxes} cajas` : ""}.`, 48, 1453);
    ctx.font = "18px Figtree, sans-serif";
    ctx.fillText("Precios sujetos a disponibilidad y confirmación. Pueden variar en origen.", 48, 1485);
    ctx.fillText(`vasconcelo.shop · Lámina ${pageIndex + 1} de ${pages.length}`, 48, 1520);
    watermark(ctx);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No pudimos guardar el PNG.")), "image/png"));
    blobs.push(blob);
  }
  return { blobs, missing };
}

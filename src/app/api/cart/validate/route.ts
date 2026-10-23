import { getDb } from "@/db/client";
import { listAllProducts } from "@/features/catalog/data";
import { currentRate } from "@/features/fx/service";
import { hasAsset } from "@/components/slot";
import { evaluateCart } from "@/features/inquiries/pricing";
import { ValidateRequestSchema } from "@/features/inquiries/schemas";
import { COMBO, COMBO_HEADLINE, pricingScenarios } from "@/features/promos/combo";
import { getComboConfig } from "@/features/promos/settings";
import { buildSuggestions } from "@/features/promos/sugerencias";
import { errorJson, json, readJson, rateLimited, sameOrigin } from "@/server/http";

export const runtime = "nodejs";

/**
 * Revalida el carrito con el catálogo vigente: precios, disponibilidad y límites salen siempre del servidor. También calcula los importes (lista, combo caja + sobres,
 * transferencia y total) y las sugerencias del carrito lateral: el navegador solo muestra lo que recibe y nunca determina un importe.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  if (await rateLimited(req, "validar-carrito", Number(process.env.RATE_LIMIT_VALIDATE_PER_MIN || 120), 60)) {
    return errorJson(429, "rate_limited", "Demasiadas solicitudes. Esperá un momento e intentá de nuevo.");
  }
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  const parsed = ValidateRequestSchema.safeParse(body);
  if (!parsed.success) return errorJson(400, "invalid_input", "Revisá los productos del carrito.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));

  // Una sola lectura de la cotización: la misma convierte los precios y se informa al carrito.
  const db = getDb();
  const fx = await currentRate(db);
  const [products, comboSetting] = await Promise.all([listAllProducts(fx), getComboConfig(db)]);
  const combo = comboSetting.config;
  const ev = evaluateCart(parsed.data.items, products, combo);
  const scenarios = pricingScenarios(ev.pricingInput, combo);
  const imageOf = (p: (typeof products)[number]) => {
    const img = p.images[0];
    return { src: img && hasAsset(img.src) ? img.src : null, alt: img?.alt ?? p.title };
  };
  const suggestions = buildSuggestions(products, parsed.data.items.map((i) => i.productId), scenarios.base, combo, imageOf);
  return json({
    fx: fx.rate10k ? { rate10k: fx.rate10k, mode: fx.mode, warn: fx.warn } : null,
    /** ¿El pedido califica para cuotas / 10% OFF por transferencia? (al menos una caja disponible; los encargos no cuentan). */
    qualifiesForPromo: ev.qualifiesForPromo,
    /** Importes del pedido: «base» (efectivo, cuotas o sin elegir) y «transferencia». Cada línea trae lista, descuento del combo, descuento por transferencia y total. */
    pricing: scenarios,
    combo: { headline: COMBO_HEADLINE, percent: COMBO.percent, perBox: COMBO.boostersPerBox, ...scenarios.base.combo },
    suggestions,
    lines: ev.lines.map((l) => {
      const p = l.product;
      const img = p?.images[0];
      return {
        productId: l.productId,
        status: l.status,
        requestedQuantity: l.requestedQuantity,
        maxQuantity: l.maxQuantity,
        unitPriceMinor: l.unitPriceMinor ?? null,
        unitPriceUsdMinor: l.product?.priceUsdMinor ?? null,
        previousPriceMinor: l.previousPriceMinor ?? null,
        product: p && {
          slug: p.slug, title: p.title, sku: p.sku, language: p.language, kind: p.kind, fallbackTone: p.fallbackTone, packSize: p.packSize ?? null,
          imageSrc: img && hasAsset(img.src) ? img.src : null, imageAlt: img?.alt ?? p.title,
        },
      };
    }),
  });
}

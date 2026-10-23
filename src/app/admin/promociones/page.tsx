import { AdminComboSettings, type ComboCandidate } from "@/components/admin-combo-settings";
import { catalog } from "@/content/catalog";
import { languageLabel } from "@/content/schema";
import { getDb } from "@/db/client";
import { listAllProducts } from "@/features/catalog/data";
import { currentRate } from "@/features/fx/service";
import { COMBO_HEADLINE } from "@/features/promos/combo";
import { getComboConfig } from "@/features/promos/settings";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

const when = (ms: number, who: string | null) => `${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms))}${who ? ` por ${who}` : ""}`;

export default async function Promociones() {
  await requireAdmin("/admin/promociones");
  const db = getDb();
  const fx = await currentRate(db);
  const [products, setting] = await Promise.all([listAllProducts(fx, db), getComboConfig(db)]);
  const retired = new Set(catalog.products.filter((p) => p.retired).map((p) => p.id));
  const cand = (kind: "box" | "booster"): ComboCandidate[] =>
    products.filter((p) => p.kind === kind && !retired.has(p.id)).sort((a, b) => a.title.localeCompare(b.title, "es"))
      .map((p) => ({ id: p.id, title: p.title, sku: p.sku, language: languageLabel[p.language], priceLabel: p.priceMinor === null ? "precio pendiente" : formatARS(p.priceMinor), stockLabel: p.stockQuantity === null ? "stock pendiente" : p.stockQuantity === 0 ? "sin stock" : `stock ${p.stockQuantity}` }));
  const known = new Set(products.map((p) => p.id));
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Promoción caja + sobres</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">Elegí qué cajas y qué sobres participan y activala cuando quieras. Es solo una lista: no cambia ningún precio ni stock, y cada cambio queda en el historial.</p>
      <AdminComboSettings
        enabled={setting.config.enabled}
        boxes={cand("box")}
        boosters={cand("booster")}
        boxIds={setting.config.boxIds.filter((id) => known.has(id))}
        boosterIds={setting.config.boosterIds.filter((id) => known.has(id))}
        version={setting.updatedAt ?? 0}
        updatedLabel={setting.updatedAt ? when(setting.updatedAt, setting.updatedByEmail) : null}
        headline={COMBO_HEADLINE}
      />
    </div>
  );
}

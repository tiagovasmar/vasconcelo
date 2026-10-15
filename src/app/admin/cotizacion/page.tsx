import { AdminFxPanel, type FxPanelData } from "@/components/admin-fx-panel";
import { catalog } from "@/content/catalog";
import { getDb } from "@/db/client";
import { adminProducts } from "@/features/catalog/overrides";
import { ageLabel, formatRate, MANUAL_REVIEW_AGE_MS, usdInputText } from "@/features/fx/convert";
import { autoRefreshEnabled, currentRate, getFxRow, listFxLog } from "@/features/fx/service";
import { requireAdmin } from "@/server/admin";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (ms: number | null) => (ms ? new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms)) : null);
const rateText = (r10k: number | null) => (r10k ? formatRate(r10k) : null);

export default async function Cotizacion() {
  await requireAdmin("/admin/cotizacion");
  const db = getDb();
  const now = nowMs();
  const fx = await currentRate(db, now);
  const row = await getFxRow(db, now);
  const fxLog = await listFxLog(db, 30);
  const products = (await adminProducts(db, catalog.products.filter((p) => !p.retired), fx)).filter((a) => a.product.priceUsdMinor).map((a) => ({ id: a.product.id, title: a.product.title, usdMinor: a.product.priceUsdMinor!, arsMinor: a.product.priceMinor }));
  const LOG: Record<string, (r: (typeof fxLog)[number]) => string> = {
    auto_rate: (r) => `Cotización automática: ${rateText(r.rate10k)}${r.detail ? ` · ${r.detail}` : ""}`,
    auto_error: (r) => `Falló la actualización automática: ${r.detail ?? "error"}`,
    manual_rate: (r) => `${r.userEmail ?? "El dueño"} fijó el valor manual ${rateText(r.rate10k)}${r.detail ? ` · «${r.detail}»` : ""}`,
    mode: (r) => `${r.userEmail ?? "El dueño"}: ${r.detail ?? "cambio de modo"}`,
  };
  const data: FxPanelData = {
    mode: fx.mode,
    status: fx.status,
    rateLabel: rateText(fx.rate10k),
    autoRateLabel: rateText(row.autoRate10k),
    providerUpdated: fmt(row.autoProviderUpdatedAt),
    fetchedAt: fmt(row.autoFetchedAt),
    fetchedAge: row.autoFetchedAt ? ageLabel(now - row.autoFetchedAt) : null,
    lastAttempt: fmt(row.lastAttemptAt),
    lastError: row.lastError,
    lastErrorAt: fmt(row.lastErrorAt),
    manualRateLabel: rateText(row.manualRate10k),
    manualSetAt: fmt(row.manualSetAt),
    manualSetBy: row.manualSetByEmail,
    manualNote: row.manualNote,
    manualOld: row.manualSetAt !== null && now - row.manualSetAt > MANUAL_REVIEW_AGE_MS,
    rate10k: fx.rate10k,
    suggested: fx.rate10k ? usdInputText(fx.rate10k / 100) : "",
    products,
    log: fxLog.map((l) => ({ id: l.id, when: fmt(l.createdAt)!, kind: l.kind, text: (LOG[l.kind] ?? (() => l.kind))(l) })),
    refreshEnabled: autoRefreshEnabled(),
  };
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Cotización del dólar</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">
        Los precios base se cargan en USD y la tienda los muestra en pesos con el <b>dólar blue, valor de venta</b>, redondeado a múltiplos de $100.
        La cotización se actualiza sola cada 15 minutos y se comparte entre todos los visitantes. Si el proveedor falla se conserva la última válida; pasadas 24 horas sin una consulta exitosa los precios en pesos quedan pendientes.
      </p>
      <div className="mt-6"><AdminFxPanel data={data} /></div>
    </div>
  );
}

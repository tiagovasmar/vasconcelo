import Link from "next/link";
import { AdminForm } from "@/components/admin-form";
import { ProductCostEditor } from "@/components/product-cost-editor";
import { kindLabel, productKinds } from "@/content/schema";
import { catalog } from "@/content/catalog";
import { catalogGames, gameLabel } from "@/content/games";
import { getDb } from "@/db/client";
import { applyOverrides, loadOverrides } from "@/features/catalog/overrides";
import { listProductLogistics } from "@/features/costos/product-logistics";
import { listProductCosts } from "@/features/costos/product-costs";
import { averageCosts } from "@/features/costos/service";
import { getEffectiveRate } from "@/features/fx/service";
import { listTiersForAdmin } from "@/features/mayorista/precios";
import { arsMinorToUsdMinor, usdInputText } from "@/features/fx/convert";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";
const path = "/admin/costos-productos";
const input = "mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base";
const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default async function ProductCostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin(path);
  const params = await searchParams;
  const game = catalogGames.find((value) => value === params.juego) ?? "";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const db = getDb();
  const products = applyOverrides(catalog.products, await loadOverrides(db)).filter((p) => {
    const search = normalize(`${p.title} ${p.originalTitle ?? ""} ${p.sku} ${p.id}`);
    return !p.retired && (!game || (p.game ?? "pokemon") === game) && terms.every((term) => search.includes(term));
  }).sort((a, b) => a.title.localeCompare(b.title, "es"));
  const ids = products.map((p) => p.id);
  const [manual, averages, logistics, fx, tiers] = await Promise.all([
    listProductCosts(db, ids), averageCosts(db, ids), listProductLogistics(db), getEffectiveRate(db), listTiersForAdmin(db),
  ]);
  const wholesale = Map.groupBy(tiers, (tier) => tier.productId);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
      <p className="eyebrow text-emerald">Productos · privado</p>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Costos por producto</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">Ingresá el costo total por unidad, incluido el envío y la aduana si corresponde. Al registrar una venta, se usa el promedio de compras confirmadas si existe y, en su defecto, este costo de referencia. Para referencias en USD se usa la cotización vigente al registrar la venta.</p>
      <details className="mt-5 rounded-xl border border-ink/15 bg-white p-4" id="envio-y-aduana">
        <summary className="cursor-pointer font-semibold">Envío y aduana por tipo de producto</summary>
        <p className="mt-2 text-sm text-ink/75">Guardá importes en USD por unidad para precargar la calculadora. Podés ajustarlos al calcular cada producto.</p>
        <ul className="mt-3 divide-y divide-ink/10">
          {productKinds.map((kind) => {
            const preset = logistics.get(kind);
            return <li key={kind} className="grid items-center gap-2 py-3 sm:grid-cols-[9rem_1fr]">
              <h2 className="text-sm font-semibold">{kindLabel[kind]}</h2>
              <AdminForm endpoint="/api/admin/costos" compact idempotent={false} resetAfterSave={false}
                fixed={{ action: "product_logistics", kind, expectedVersion: preset?.version ?? 0 }}
                fields={[
                  { name: "shippingMinor", label: "Envío por unidad (USD)", type: "usd", defaultValue: usdInputText(preset?.shippingMinor ?? null) },
                  { name: "customsMinor", label: "Aduana por unidad (USD)", type: "usd", defaultValue: usdInputText(preset?.customsMinor ?? null) },
                ]} submit="Guardar importes" ok="Importes guardados." testId={`costos-logistica-${kind}`} />
            </li>;
          })}
        </ul>
      </details>
      <form action={path} role="search" className="mt-5 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-56 text-sm font-semibold">Producto o SKU<input name="q" type="search" defaultValue={query} maxLength={80} className={input} /></label>
        <label className="text-sm font-semibold">Juego<select name="juego" defaultValue={game} className={input}><option value="">Todos</option>{catalogGames.map((value) => <option key={value} value={value}>{gameLabel[value]}</option>)}</select></label>
        <button className="min-h-11 rounded-md bg-ink px-5 text-sm font-semibold text-paper">Buscar</button>
        {(query || game) && <Link href={path} className="inline-flex min-h-11 items-center text-sm underline">Limpiar</Link>}
      </form>
      <p className="mt-4 text-sm text-ink/75">Para quitar un costo de referencia, vaciá el importe y guardá.</p>
      {products.length === 0 && <p className="mt-4 text-sm">Ningún producto coincide con la búsqueda.</p>}
      <ul className="mt-3 space-y-2">
        {products.map((product) => {
          const entry = manual.get(product.id);
          const average = averages.get(product.id);
          const published = wholesale.get(product.id)?.find((tier) => tier.state === "publicado");
          const retailUsd = product.priceUsdMinor ?? (product.priceMinor ? arsMinorToUsdMinor(product.priceMinor, fx.rate10k) : null);
          return <li key={product.id} className="grid gap-3 rounded-lg border border-ink/15 bg-white p-3">
            <div>
              <h2 className="text-sm font-semibold">{product.title}</h2>
              <p className="text-xs text-ink/75">{product.sku} · {gameLabel[product.game ?? "pokemon"]} · {kindLabel[product.kind]}</p>
              {average !== undefined && <p className="mt-1 text-xs text-ink/75">Promedio de compras: {formatARS(average)} por unidad</p>}
            </div>
            <ProductCostEditor productId={product.id} logistics={logistics.get(product.kind)} entry={entry}
              averageUsd={average === undefined ? null : arsMinorToUsdMinor(average, fx.rate10k)}
              rate10k={fx.rate10k} retailUsd={retailUsd} wholesaleUsd={published?.unitPriceUsdMinor ?? null} />
          </li>;
        })}
      </ul>
    </div>
  );
}

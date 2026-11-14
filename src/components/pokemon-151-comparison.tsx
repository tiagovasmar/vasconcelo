import Link from "next/link";
import { languageLabel, type Product } from "@/content/schema";
import { chinese151Cards, pokemon151Versions } from "@/content/real/pokemon-151-versions";
import { confirmedBoosters, pricePerBooster } from "@/features/catalog/per-booster";
import { formatARS } from "@/lib/format";

export function Pokemon151Comparison({ current, products }: { current: Product; products: Product[] }) {
  const versions = pokemon151Versions.flatMap((version) => {
    const product = products.find((p) => p.id === version.productId && p.active && !p.retired && ((p.priceMinor ?? 0) > 0 || (p.priceUsdMinor ?? 0) > 0));
    return product ? [{ label: version.label, product }] : [];
  });
  const reference = pokemon151Versions.flatMap((version) => {
    const source = chinese151Cards[version.productId]?.source;
    return "largeLabel" in version && source ? [{ label: version.largeLabel, source }] : [];
  });
  return (
    <section id="comparar-151" aria-labelledby="h-comparar-151" className="scroll-mt-16">
      <h2 id="h-comparar-151" className="display text-3xl normal-case sm:text-4xl">Comparar versiones de Pokémon 151</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-ink/20 bg-white">
        <table className="w-full min-w-[590px] text-left text-sm">
          <caption className="sr-only">Idioma, contenido y precio por sobre de las cajas 151</caption>
          <thead className="bg-paper-2"><tr>
            {["Versión", "Idioma", "Sobres por caja", "Cartas por sobre", "Precio por sobre"].map((label) => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-ink/10">
            {versions.map(({ label, product }) => {
              const unit = pricePerBooster(product);
              return <tr key={product.id} className={product.id === current.id ? "bg-emerald/10" : ""}>
                <th scope="row" className="px-3 py-3 font-semibold">
                  {product.id === current.id ? <span aria-current="page">{label}</span> : <Link href={`/productos/${product.slug}`} className="underline underline-offset-4">{label}</Link>}
                </th>
                <td className="px-3 py-3">{languageLabel[product.language]}</td>
                <td className="px-3 py-3">{confirmedBoosters(product) ?? "A confirmar"}</td>
                <td className="px-3 py-3">{product.contents.find((item) => item.label === "Cartas por sobre")?.quantity ?? "A confirmar"}</td>
                <td className="px-3 py-3">{unit ? `${unit.approxArs ? "Aprox. " : ""}${formatARS(unit.arsMinor)}` : "A confirmar"}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink/70">Precio por sobre al comprar la caja, antes de promociones.</p>
      <details className="mt-4 rounded-lg border border-ink/15 bg-white p-3">
        <summary className="cursor-pointer font-semibold">Formatos chinos de 20 cartas por sobre</summary>
        <p className="mt-2 text-sm text-ink/80">Pokémon China informa 7 cartas brillantes por sobre en estos formatos. Presentaciones de referencia del fabricante.</p>
        <ul className="mt-2 space-y-1 text-sm">{reference.map(({ label, source }) => <li key={label}>
          <a href={source} target="_blank" rel="noreferrer" className="underline underline-offset-4">{label} ↗</a>
        </li>)}</ul>
      </details>
    </section>
  );
}

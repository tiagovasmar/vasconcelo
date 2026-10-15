import type { Guarantee, Product, PullRate, Source } from "@/content/schema";
import { getExpansion } from "@/features/catalog/data";
import { agruparResumen, cantidadLabel, conRarezas, tituloContenido } from "@/features/catalog/garantias";

const evidenceBadge = { official: "Fuente oficial", seller_pack_contents: "Según la ficha del proveedor", unverified: "Sin verificar" } as const;
const fecha = (iso: string) => new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 inline-block border border-ink/40 bg-white px-1.5 py-0.5 align-middle text-[.62rem] font-bold uppercase tracking-wide">{children}</span>;
}

/**
 * «Qué garantiza esta caja» (resumen cerca del precio) y su detalle desplegable. Separa tres cosas que no se mezclan:
 *  · contenido físico confirmado (sobres, cartas por sobre, accesorios fijos),
 *  · garantía de rarezas DOCUMENTADA (solo lo que una fuente adecuada respalda para esa caja: hoy ninguna),
 *  · composición habitual observada (estimación con muestra, nunca bajo el título de garantía; aparece solo si hay datos).
 * Los sobres sueltos usan el mismo bloque pero SIN la fila de rarezas ni el encabezado de garantía por caja.
 */
export function GarantiasResumen({ product, guarantees: todas, rates, sources }: { product: Product; guarantees: Guarantee[]; rates: PullRate[]; sources: Source[] }) {
  // Una garantía sin verificar NUNCA se muestra como promesa: solo se avisa que existe información sin verificar.
  const guarantees = todas.filter((g) => g.evidence !== "unverified");
  const { comp, rarezas, fisico } = agruparResumen(guarantees);
  const sinVerificar = todas.length - guarantees.length;
  const caja = conRarezas(product);
  const review = product.rarityReview;
  const observadas = rates.filter((r) => r.evidence === "observed");
  const fuente = (ids: string[]) => ids.map((id) => sources.find((s) => s.id === id)).filter((s): s is Source => Boolean(s));
  const titulo = tituloContenido(product);
  const fila = "grid gap-1 border-t border-ink/15 py-3 first:border-t-0 first:pt-0 sm:grid-cols-[11rem_1fr] sm:gap-4";
  const dt = "text-xs font-bold uppercase tracking-wider text-ink/70";
  return (
    <section id="contenido" aria-labelledby="h-cont" className="mt-6 scroll-mt-16 border border-ink/25 bg-white/70 p-4" data-testid="garantias-resumen">
      <h2 id="h-cont" className="text-xl font-extrabold leading-tight">{titulo}</h2>
      <dl className="mt-3 text-sm">
        <div className={fila}>
          <dt className={dt}>Contenido físico confirmado</dt>
          <dd>
            {product.contents.length ? (
              <ul className="space-y-1">
                {product.contents.map((c) => (
                  <li key={c.label}>{c.quantity ? <b>{c.quantity}{c.unit ? ` ${c.unit}` : ""} · </b> : null}{c.label}{c.note ? <span className="text-ink/70"> — {c.note}</span> : null}</li>
                ))}
              </ul>
            ) : <span className="text-ink/70">Sin cantidades documentadas para este producto.</span>}
            {fisico.length > 0 && <p className="mt-1 text-xs text-ink/65">{cantidadLabel.fixed} · {fisico.map((g) => evidenceBadge[g.evidence]).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</p>}
          </dd>
        </div>
        {comp.length > 0 && (
          <div className={fila}>
            <dt className={dt}>{product.kind === "booster" ? "Garantizado en el sobre" : "Garantizado en cada sobre"}</dt>
            <dd>
              <ul className="space-y-2">
                {comp.map((g) => (
                  <li key={g.id}>{g.statement} <Etiqueta>{cantidadLabel[g.quantityKind ?? "fixed"]}</Etiqueta> <Etiqueta>{evidenceBadge[g.evidence]}</Etiqueta></li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {caja && (
          <div className={fila}>
            <dt className={dt}>Rarezas garantizadas</dt>
            <dd>
              {rarezas.length ? (
                <ul className="space-y-2">{rarezas.map((g) => <li key={g.id}>{g.statement} <Etiqueta>{cantidadLabel[g.quantityKind ?? "minimum"]}</Etiqueta> <Etiqueta>{evidenceBadge[g.evidence]}</Etiqueta></li>)}</ul>
              ) : (
                <><b>Sin confirmación documental.</b> <span className="text-ink/70">No significa que no haya un patrón habitual: no hay respaldo para prometerlo.</span></>
              )}
            </dd>
          </div>
        )}
        {product.packComposition && (
          <div className={fila}>
            <dt className={dt}>Composición del pack</dt>
            <dd>{product.packComposition.map((pc) => `${pc.packCount} × ${getExpansion(pc.expansionId)?.name}`).join(" + ")}. Es una composición propia de la tienda: no hereda las garantías de una caja de fábrica.</dd>
          </div>
        )}
        {observadas.length > 0 && (
          <div className={fila}>
            <dt className={dt}>Composición habitual observada</dt>
            <dd>Estimación a partir de aperturas, <b>no es una garantía</b>. La muestra y el método están en «Probabilidades».</dd>
          </div>
        )}
      </dl>
      {sinVerificar > 0 && <p className="mt-2 border-l-4 border-vermilion bg-vermilion/10 px-3 py-2 text-xs">Hay información de rarezas que todavía <b>no pudimos verificar</b> con una fuente aplicable a este producto: no se presenta como garantía.</p>}
      <details className="mt-3 border-t border-ink/15 pt-3" data-testid="garantias-detalle">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Detalle, fuentes y alcance</summary>
        <div className="mt-2 space-y-3 text-xs leading-relaxed text-ink/80">
          {guarantees.length > 0 && (
            <ul className="space-y-2">
              {guarantees.map((g) => (
                <li key={g.id} className="border-l-4 border-emerald pl-3">
                  <p>{g.statement} <Etiqueta>{evidenceBadge[g.evidence]}</Etiqueta></p>
                  <p className="text-ink/65">Alcance: {product.title}, {g.language === "ja" ? "edición japonesa" : g.language === "zh" ? "edición china simplificada" : g.language}, región {g.region}. Revisada el {fecha(g.reviewedAt)}. Fuente: {fuente(g.sourceIds).map((s, i) => (<span key={s.id}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald">{s.publisher} ↗</a></span>))}</p>
                </li>
              ))}
            </ul>
          )}
          {review && caja && (
            <div className="border-l-4 border-gold pl-3" data-testid="revision-rarezas">
              <p><b>Rarezas garantizadas: sin confirmación documental.</b> {review.note}</p>
              <p className="text-ink/65">Revisado el {fecha(review.checkedAt)}. Fuentes revisadas: {fuente(review.sourceIds).map((s, i) => (<span key={s.id}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald">{s.publisher} ↗</a></span>))}</p>
            </div>
          )}
          <ul className="list-disc space-y-1 pl-4 text-ink/70">
            <li>Una garantía por sobre no se multiplica por los sobres de la caja para deducir rarezas, y las cantidades alternativas no se suman.</li>
            <li>Las garantías no se trasladan entre cajas normales, cajas especiales, sobres sueltos ni ediciones de otros idiomas o regiones.</li>
          {product.language === "zh" && <li>Los datos del proveedor chino se tomaron de sus fichas y envases, no de una ficha oficial.</li>}
          </ul>
        </div>
      </details>
    </section>
  );
}

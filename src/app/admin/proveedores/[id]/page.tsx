import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminTaobaoQuoteForm } from "@/components/admin-taobao-quote-form";
import { getDb } from "@/db/client";
import { listTaobaoQuotes } from "@/features/admin/taobao-quotes";
import { getTaobaoSupplier } from "@/features/admin/taobao-suppliers";
import { quoteAmount, usdFromRmb } from "@/lib/taobao-quote";
import { requireAdmin } from "@/server/admin";

const card = "min-w-0 rounded-xl border border-ink/15 bg-white p-4 sm:p-5";
const action = "inline-flex min-h-11 items-center text-sm font-semibold text-emerald underline underline-offset-4";
const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" });

export default async function ProveedorDetalle({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nueva?: string; editar?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const path = `/admin/proveedores/${encodeURIComponent(id)}`;
  await requireAdmin(path);
  const db = getDb();
  const supplier = await getTaobaoSupplier(db, id);
  if (!supplier) notFound();
  const quotes = await listTaobaoQuotes(db, supplier.id);
  const editing = quotes.find((quote) => quote.id === query.editar);
  const showForm = !supplier.archived && (query.nueva === "1" || editing);

  return (
    <div className="mx-auto max-w-[1080px] space-y-5 px-4 py-8 sm:px-8">
      <header>
        <Link href={`/admin/proveedores${supplier.archived ? "?estado=archivados" : ""}`} className={action}>← Proveedores de Taobao</Link>
        <p className="eyebrow mt-2 text-emerald">Operaciones · privado</p>
        <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight">{supplier.name}</h1>
        <Link href={supplier.url} target="_blank" rel="noopener noreferrer" className={action}>Abrir enlace del proveedor ↗</Link>
        {supplier.archived && <p className="text-sm text-ink/75">Proveedor archivado. Podés consultar las cotizaciones guardadas.</p>}
      </header>
      <section aria-labelledby="notas-proveedor" className={card}>
        <h2 id="notas-proveedor" className="font-semibold">Notas del proveedor</h2>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink/75">{supplier.note || "Todavía no agregaste notas para este proveedor."}</p>
      </section>
      <section aria-labelledby="cotizaciones" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cotizaciones" className="text-lg font-semibold">Productos y cotizaciones</h2>
          {!supplier.archived && !showForm && <Link href={`${path}?nueva=1`} className="inline-flex min-h-11 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white">+ Nueva cotización</Link>}
        </div>
        {showForm && (
          <section className={card} aria-label={editing ? "Editar cotización" : "Nueva cotización"}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{editing ? "Editar cotización" : "Nueva cotización"}</h3>
              <Link href={path} className={action}>Cancelar</Link>
            </div>
            <AdminTaobaoQuoteForm key={editing ? `${editing.id}:${editing.version}` : "new"} supplierId={supplier.id} quote={editing} />
          </section>
        )}
        {!quotes.length && !showForm && <p className="text-sm text-ink/75">Todavía no hay publicaciones cotizadas.</p>}
        {quotes.map((quote) => (
          <article key={quote.id} className={card}>
            <div className="flex flex-wrap justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words text-lg font-semibold">{quote.title}</h3>
                <p className="mt-1 text-sm text-ink/75">1 USD = {(quote.rate / 10_000).toLocaleString("es-AR", { maximumFractionDigits: 4 })} RMB · {quote.rateDate ? `BCE del ${date.format(new Date(`${quote.rateDate}T12:00:00Z`))}` : "Cotización manual"}</p>
                <p className="text-sm text-ink/75">Actualizada el {date.format(quote.version)}</p>
              </div>
              <div className="flex flex-wrap gap-x-4">
                <Link href={quote.url} target="_blank" rel="noopener noreferrer" className={action}>Abrir publicación ↗</Link>
                {!supplier.archived && <Link href={`${path}?editar=${quote.id}`} className={action}>Editar cotización</Link>}
              </div>
            </div>
            {quote.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink/80">{quote.note}</p>}
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {quote.variants.map((row, index) => {
                const usd = usdFromRmb(row.rmb, quote.rate);
                return (
                  <li key={index} className="flex min-w-0 gap-3 rounded-lg border border-ink/15 bg-paper p-3">
                    {row.photo
                      ? <Image src={row.photo} unoptimized width={72} height={72} className="size-[72px] shrink-0 rounded-md bg-white object-contain" alt={row.name} />
                      : <span className="grid size-[72px] shrink-0 place-items-center rounded-md bg-white text-xs text-ink/70">Sin foto</span>}
                    <div className="min-w-0 break-words text-sm">
                      <p className="font-semibold">{row.name}</p>
                      <p>{quoteAmount(row.rmb, "RMB")} · <strong>{quoteAmount(usd, "USD")}</strong></p>
                      {row.logisticsUsd !== null && <p className="text-ink/75">Con envío y aduana · <strong>{quoteAmount(usd + row.logisticsUsd, "USD")}</strong></p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}

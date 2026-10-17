import Link from "next/link";
import { getDb } from "@/db/client";
import { CRM_STATUSES, crmLabel, inquiryMetrics, listInquiries, type CrmStatus, type InquiryFilters } from "@/features/consultas/service";
import { pct, when } from "@/features/consultas/ui";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";
const PAGE = 30;

const tone: Record<CrmStatus, string> = { pendiente: "bg-gold/30 ring-gold", en_seguimiento: "bg-emerald/10 ring-emerald", convertida: "bg-emerald text-paper ring-emerald", no_concretada: "bg-ink/10 ring-ink/40" };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const field = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";
const lbl = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";

function Metric({ label, value, hint, id }: { label: string; value: string | number; hint?: string; id: string }) {
  return (
    <div className="rounded-xl border border-ink/15 bg-white p-4" data-testid={`metrica-${id}`}>
      <dt className="text-xs font-semibold uppercase tracking-[.1em] text-ink/70">{label}</dt>
      <dd className="mt-1">
        <span className="block text-2xl font-semibold tabular-nums" data-valor>{value}</span>
        {hint && <span className="mt-1 block text-xs text-ink/65">{hint}</span>}
      </dd>
    </div>
  );
}

export default async function AdminConsultas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/consultas");
  const sp = await searchParams;
  const status = (CRM_STATUSES as readonly string[]).includes(one(sp.estado)) ? (one(sp.estado) as CrmStatus) : "";
  const ymd = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const filters: InquiryFilters = {
    q: one(sp.q).slice(0, 80), from: ymd(one(sp.desde)), to: ymd(one(sp.hasta)), status,
    contact: one(sp.contacto) === "confirmado" || one(sp.contacto) === "sin_confirmar" ? (one(sp.contacto) as "confirmado" | "sin_confirmar") : "",
    source: one(sp.origen) === "web" || one(sp.origen) === "manual" ? (one(sp.origen) as "web" | "manual") : "",
  };
  const page = Math.max(1, Number(one(sp.pagina)) || 1);
  const db = getDb();
  const [m, list] = await Promise.all([inquiryMetrics(db, filters), listInquiries(db, { ...filters, limit: PAGE, offset: (page - 1) * PAGE })]);
  const filtered = Boolean(filters.q || filters.status || filters.contact || filters.source || filters.from || filters.to);
  const period = filters.from || filters.to ? `${filters.from || "el inicio"} a ${filters.to || "hoy"}` : "todo el tiempo";
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const all: Record<string, string> = { q: filters.q ?? "", desde: filters.from ?? "", hasta: filters.to ?? "", estado: filters.status ?? "", contacto: filters.contact ?? "", origen: filters.source ?? "", ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-emerald">Panel del dueño</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Consultas</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/consultas/nueva" className="inline-flex min-h-11 items-center rounded-lg bg-emerald px-4 text-sm font-semibold text-paper hover:bg-emerald-2" data-testid="nueva-consulta">Cargar consulta manual</Link>
          <Link href="/admin/ventas" className="inline-flex min-h-11 items-center rounded-lg border border-ink/40 px-4 text-sm font-semibold hover:bg-white">Ver ventas</Link>
        </div>
      </div>

      <form method="get" className="mt-6 grid gap-3 rounded-xl border border-ink/15 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filtros de consultas" data-testid="filtros-consultas">
        <div className="sm:col-span-2"><label htmlFor="f-q" className={lbl}>Buscar por persona, teléfono o número</label><input id="f-q" name="q" defaultValue={filters.q} placeholder="Ej.: Muñoz, 4444-9999 o TT-ABC…" className={field} data-testid="f-q" /></div>
        <div><label htmlFor="f-desde" className={lbl}>Desde</label><input id="f-desde" type="date" name="desde" defaultValue={filters.from} className={field} data-testid="f-desde" /></div>
        <div><label htmlFor="f-hasta" className={lbl}>Hasta</label><input id="f-hasta" type="date" name="hasta" defaultValue={filters.to} className={field} data-testid="f-hasta" /></div>
        <div><label htmlFor="f-estado" className={lbl}>Estado</label>
          <select id="f-estado" name="estado" defaultValue={filters.status} className={field} data-testid="f-estado"><option value="">Todos</option>{CRM_STATUSES.map((s) => <option key={s} value={s}>{crmLabel[s]}</option>)}</select></div>
        <div><label htmlFor="f-contacto" className={lbl}>Contacto</label>
          <select id="f-contacto" name="contacto" defaultValue={filters.contact} className={field} data-testid="f-contacto"><option value="">Todos</option><option value="confirmado">Contacto confirmado</option><option value="sin_confirmar">Solo consulta generada</option></select></div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper hover:bg-emerald" data-testid="f-aplicar">Aplicar</button>
          <Link href="/admin/consultas" className="inline-flex min-h-11 items-center rounded-lg border border-ink/40 px-4 text-sm hover:bg-paper">Limpiar</Link>
        </div>
      </form>

      <section aria-labelledby="h-metricas" className="mt-6">
        <h2 id="h-metricas" className="text-lg font-semibold">Métricas · {period}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink/75">Las cifras de consultas son de las consultas <b>creadas</b> en el período, aunque se hayan convertido después (la búsqueda y los demás filtros no las modifican; solo cambia el período). Las ventas e ingresos van aparte y se cuentan por <b>fecha de la venta</b>.</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Metric id="generadas" label="Consultas generadas" value={m.generated} hint={`${m.web} de la tienda · ${m.manual} manuales`} />
          <Metric id="contactos" label="Contactos confirmados" value={m.contactConfirmed} hint="Marcados a mano por vos" />
          <Metric id="pendientes" label="Pendientes" value={m.pendiente} />
          <Metric id="seguimiento" label="En seguimiento" value={m.enSeguimiento} />
          <Metric id="no-concretadas" label="No concretadas" value={m.noConcretada} />
          <Metric id="convertidas" label="Convertidas en venta" value={m.convertida} hint="Con una venta vigente" />
        </dl>
        <dl className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric id="conversion" label="Conversión sobre generadas" value={pct(m.conversionGenerated)} hint={`${m.convertida} convertidas ÷ ${m.generated} consultas generadas`} />
          <Metric id="conversion-contactos" label="Conversión sobre contactos" value={pct(m.conversionConfirmed)} hint={`${m.convertida} convertidas ÷ ${m.contactConfirmed} con contacto confirmado`} />
          <Metric id="ventas" label="Ventas del período" value={m.salesCount} hint={`${m.salesWithoutInquiry} sin consulta · ${m.voidedCount} anuladas (no cuentan)`} />
          <Metric id="ingresos" label="Ingresos del período" value={formatARS(m.revenueMinor)} hint="Ventas vigentes por fecha de la venta" />
        </dl>
        <p className="mt-2 max-w-3xl text-xs text-ink/65">Una venta anulada deja de contar como conversión y como ingreso. Al convertir una consulta, el contacto queda confirmado automáticamente.</p>
      </section>

      <section aria-labelledby="h-lista" className="mt-8">
        <h2 id="h-lista" className="text-lg font-semibold">Listado</h2>
        <p role="status" className="mt-1 text-sm text-ink/70" data-testid="consultas-cantidad">{list.total} {list.total === 1 ? "consulta" : "consultas"}{filtered ? " con estos filtros" : ""}</p>
        {list.rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70" data-testid="consultas-vacio">{filtered ? "No hay consultas con estos filtros." : "Todavía no hay consultas."}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {list.rows.map((r) => (
              <li key={r.id} data-testid="consulta-fila">
                <Link href={`/admin/consultas/${r.id}`} className="block rounded-xl border border-ink/15 bg-white p-4 text-sm hover:border-emerald">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <b className="text-base">{r.name ?? "Sin nombre"}{r.phone ? <span className="font-normal text-ink/70"> · {r.phone}</span> : null}</b>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ring-1 ${tone[r.crmStatus]}`} data-testid="consulta-estado">{crmLabel[r.crmStatus]}</span>
                      <span className="rounded-full border border-ink/30 px-3 py-0.5 text-xs font-semibold" data-testid="consulta-contacto">{r.contactConfirmedAt ? "Contacto confirmado" : "Consulta generada"}</span>
                    </span>
                  </div>
                  <p className="mt-1 text-ink/75"><span className="font-mono">{r.id}</span> · {when(r.createdAt)} · {r.source === "manual" ? "Cargada a mano" : "Desde la tienda"} · {r.units} {r.units === 1 ? "unidad" : "unidades"} en {r.lineCount} {r.lineCount === 1 ? "producto" : "productos"}{r.encargoLines ? ` (${r.encargoLines} por encargo)` : ""} · {formatARS(r.subtotalMinor - r.discountMinor)}{r.saleId ? ` · venta ${r.saleId}` : ""}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list.total > PAGE && (
          <nav aria-label="Páginas" className="mt-4 flex items-center gap-4 text-sm">
            {page > 1 && <Link href={`/admin/consultas${qs({ pagina: String(page - 1) })}`} className="underline underline-offset-4">← Anteriores</Link>}
            <span>Página {page} de {Math.ceil(list.total / PAGE)}</span>
            {page * PAGE < list.total && <Link href={`/admin/consultas${qs({ pagina: String(page + 1) })}`} className="underline underline-offset-4">Siguientes →</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}

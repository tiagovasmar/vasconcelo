import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminAccountingSummary } from "@/components/admin-accounting-summary";
import { getDb } from "@/db/client";
import { adminAttention } from "@/features/admin/attention";
import { currentAccountingMonth } from "@/features/contabilidad/period";
import { profitReport } from "@/features/costos/service";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const legacy = new URLSearchParams();
  for (const key of ["q", "estado", "idioma", "formato", "coleccion"]) {
    if (typeof params[key] === "string") legacy.set(key, params[key]);
  }
  if (legacy.size) redirect(`/admin/productos?${legacy}`);
  await requireAdmin("/admin");
  const db = getDb();
  const { month, period } = currentAccountingMonth();
  const [attention, report] = await Promise.all([adminAttention(db), profitReport(db, period)]);
  const { receipt, ready, purchase, failed, wholesalePending } = attention;
  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`));
  const pending = [
    { label: "Solicitudes mayoristas pendientes", n: wholesalePending, action: "Revisar solicitudes", href: "/admin/mayoristas#solicitudes" },
    { label: "Comprobantes por revisar", n: receipt?.n ?? 0, action: "Revisar comprobantes", href: receipt ? `/admin/pedidos/${receipt.id}#comprobantes` : "/admin/pedidos?pendiente=comprobantes" },
    { label: "Pedidos listos para entregar", n: ready?.n ?? 0, action: "Ver entrega", href: ready ? `/admin/pedidos/${ready.id}#entrega` : "/admin/pedidos?pendiente=retiro" },
    { label: "Compras por recibir", n: purchase?.n ?? 0, action: "Ver recepción", href: purchase ? `/admin/compras/${purchase.id}#recepcion` : "/admin/compras" },
    { label: "Avisos fallidos", n: failed?.n ?? 0, action: "Ver avisos", href: `/admin/avisos?estado=fallido${failed ? `#aviso-${failed.id}` : ""}` },
  ];
  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 sm:py-8">
      <p className="eyebrow text-emerald">Inicio</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl">Qué necesita atención</h1>
      <p className="mt-2 text-sm text-ink/75">Accesos directos para resolver los pendientes de la tienda.</p>
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3">
        {pending.map((item) => (
          <article key={item.label} className="flex min-w-0 flex-col rounded-lg border border-ink/15 bg-white p-3 sm:p-4">
            <Link href={item.href} prefetch={false} className="group grid flex-1 content-start gap-1 rounded-sm text-left hover:text-emerald">
              <strong className="text-2xl font-bold tabular-nums sm:text-3xl">{item.n}</strong>
              <span className="text-sm font-semibold">{item.label}</span>
              <span className="text-xs text-ink/75 group-hover:underline">{item.n ? item.action : "Ver sección"} ↗</span>
            </Link>
            {item.n > 1 && item.label === "Comprobantes por revisar" && <Link href="/admin/pedidos?pendiente=comprobantes" prefetch={false} className="mt-2 text-xs underline">Ver todos</Link>}
            {item.n > 1 && item.label === "Pedidos listos para entregar" && <Link href="/admin/pedidos?pendiente=retiro" prefetch={false} className="mt-2 text-xs underline">Ver todos</Link>}
            {item.n > 1 && item.label === "Compras por recibir" && <Link href="/admin/compras?recepcion=pendiente" prefetch={false} className="mt-2 text-xs underline">Ver todas</Link>}
          </article>
        ))}
      </div>
      <section className="mt-4 rounded-lg border border-ink/15 bg-white p-3 sm:p-4">
        <h2 className="mb-3 text-sm font-bold first-letter:uppercase">{monthLabel}</h2>
        <AdminAccountingSummary report={report} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/ventas" prefetch={false} className="inline-flex min-h-11 items-center rounded-md border border-ink/20 px-3 text-sm font-semibold hover:border-emerald">Ver contabilidad</Link>
          <Link href="/admin/productos" prefetch={false} className="inline-flex min-h-11 items-center rounded-md border border-ink/20 px-3 text-sm font-semibold hover:border-emerald">Editar precios y stock</Link>
        </div>
      </section>
    </div>
  );
}

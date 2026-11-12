import Link from "next/link";
import { MarkNotificationsRead } from "@/components/admin-notifications";
import { catalog } from "@/content/catalog";
import { getDb } from "@/db/client";
import { listAdminNotices, type NoticeKind } from "@/features/admin/notifications";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

const path = "/admin/notificaciones";
const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const labels: Record<NoticeKind, { title: string; link: (ref: string) => string }> = {
  venta: { title: "Venta registrada", link: (ref) => `/admin/ventas/${ref}` },
  anulacion: { title: "Venta anulada", link: (ref) => `/admin/ventas/${ref}` },
  consulta: { title: "Consulta de la tienda", link: (ref) => `/admin/consultas/${ref}` },
  encargo: { title: "Consulta con encargo", link: (ref) => `/admin/consultas/${ref}` },
  pedido_mayorista: { title: "Nuevo pedido mayorista", link: (ref) => `/admin/pedidos/${ref}` },
  preventa: { title: "Nueva solicitud de preventa", link: (ref) => `/admin/pedidos/${ref}` },
  mayorista: { title: "Solicitud de cuenta mayorista", link: (ref) => `/admin/mayoristas#${ref}` },
  comprobante: { title: "Comprobante recibido", link: (ref) => `/admin/pedidos/${ref}#comprobantes` },
  retiro: { title: "Pedido listo para retirar", link: (ref) => `/admin/pedidos/${ref}#entrega` },
  recepcion: { title: "Compra lista para recibir", link: (ref) => `/admin/compras/${ref}#recepcion` },
  reposicion: { title: "Solicitud de aviso de reposición", link: (ref) => `/admin/reposicion#${ref}` },
  correo: { title: "Falló un correo de la tienda", link: (ref) => `/admin/avisos?estado=fallido#aviso-${ref}` },
};

export default async function Notificaciones({ searchParams }: { searchParams: Promise<{ estado?: string; pagina?: string }> }) {
  const owner = await requireAdmin(path);
  const params = await searchParams;
  const unreadOnly = params.estado === "sin-leer";
  const requested = Number(params.pagina);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(10_000, requested) : 1;
  const { rows, hasMore } = await listAdminNotices(getDb(), owner.id, { unread: unreadOnly, page });
  const unreadKeys = rows.filter((row) => row.unread).map((row) => row.key);
  const href = (unread: boolean, page: number) => {
    const query = new URLSearchParams({ ...(unread ? { estado: "sin-leer" } : {}), ...(page > 1 ? { pagina: String(page) } : {}) });
    return query.size ? `${path}?${query}` : path;
  };

  return (
    <div className="mx-auto max-w-[1050px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Notificaciones</h1>
      <p className="mt-2 text-sm text-ink/75">Revisá las novedades de la tienda. Las consultas y los comprobantes son avisos separados de las ventas confirmadas.</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtrar notificaciones" className="flex flex-wrap gap-2">
          {[false, true].map((unread) => (
            <Link key={String(unread)} href={href(unread, 1)} aria-current={unread === unreadOnly ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold ${unread === unreadOnly ? "border-emerald bg-emerald text-white" : "border-ink/25 bg-white"}`}>
              {unread ? "Sin leer" : "Todas"}
            </Link>
          ))}
        </nav>
        {unreadKeys.length > 1 && <MarkNotificationsRead keys={unreadKeys} label="Marcar esta página como leída" />}
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-ink/15 bg-white p-5 text-sm text-ink/75">
          {page > 1 ? "No quedan avisos en esta página." : unreadOnly ? "Estás al día. No hay notificaciones sin leer." : "Todavía no hay notificaciones."}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map(({ key, kind, ref, at, detail, amount, unread }) => {
            const { title, link } = labels[kind];
            const description = kind === "reposicion" ? catalog.products.find((p) => p.id === ref)?.title ?? ref : detail;
            return (
              <li key={key} data-testid="notificacion" className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3 sm:p-4 ${unread ? "border-emerald/60" : "border-ink/15"}`}>
                <div className="min-w-0 flex-1 basis-52 break-words">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={link(encodeURIComponent(ref))} prefetch={false} className="font-semibold underline decoration-ink/30 underline-offset-4 hover:text-emerald">{title}</Link>
                    {unread && <span className="rounded-full bg-emerald/10 px-2 py-0.5 text-xs font-bold text-emerald">Sin leer</span>}
                  </div>
                  <p className="mt-1 text-sm text-ink/75">{description || ref}{amount !== null && <> · <b>{formatARS(amount)}</b></>}</p>
                  <time dateTime={new Date(at).toISOString()} className="mt-1 block text-xs text-ink/70">{date.format(at)}</time>
                </div>
                {unread && <MarkNotificationsRead keys={[key]} label="Marcar como leída" />}
              </li>
            );
          })}
        </ul>
      )}
      {(page > 1 || hasMore) && <nav aria-label="Páginas de notificaciones" className="mt-5 flex flex-wrap items-center gap-4 text-sm">
        {page > 1 && <Link href={href(unreadOnly, page - 1)} className="inline-flex min-h-11 items-center underline">Anterior</Link>}
        <span>Página {page}</span>
        {hasMore && page < 10_000 && <Link href={href(unreadOnly, page + 1)} className="inline-flex min-h-11 items-center underline">Siguiente</Link>}
      </nav>}
    </div>
  );
}

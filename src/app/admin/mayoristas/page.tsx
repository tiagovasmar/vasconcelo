import { mayorista } from "@/content/politicas";
import { getDb } from "@/db/client";
import { listWholesaleRequests } from "@/features/wholesale/service";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

const when = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));
const statusLabel = { pendiente: "Pendiente de revisión", aprobada: "Aprobada", rechazada: "Rechazada" } as const;

/** Solicitudes de cuenta mayorista (solo lectura mientras la política comercial no esté definida). */
export default async function AdminMayoristas() {
  await requireAdmin("/admin/mayoristas");
  const rows = await listWholesaleRequests(getDb());
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Solicitudes mayoristas</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/75" data-testid="mayoristas-politica">
        {mayorista.activationEnabled
          ? "La revisión está habilitada."
          : "Todavía no se pueden aprobar ni rechazar: faltan definir la compra mínima, si el 30% se acumula con el 10% por transferencia y si la aprobación es manual o automática. Mientras tanto, todas quedan pendientes y nadie tiene precio mayorista."}
      </p>
      <p role="status" className="mt-5 text-sm text-ink/70" data-testid="mayoristas-cantidad">{rows.length} {rows.length === 1 ? "solicitud" : "solicitudes"}</p>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70">Todavía no hay solicitudes.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.reference} className="rounded-xl border border-ink/15 bg-white p-4 text-sm" data-testid="mayorista-fila">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <b className="text-base">{r.businessName}</b>
                <span className="rounded-full border border-ink/30 px-3 py-0.5 text-xs font-semibold">{statusLabel[r.status]}</span>
              </div>
              <p className="mt-1 text-ink/75">{r.name} · {r.email} · {r.locality}, {r.province}</p>
              {r.note && <p className="mt-2 whitespace-pre-wrap border-l-4 border-emerald pl-3">{r.note}</p>}
              <p className="mt-2 text-xs text-ink/60">{r.reference} · solicitada el {when(r.createdAt)}{r.reviewedAt ? ` · revisada el ${when(r.reviewedAt)}${r.reviewedByEmail ? ` por ${r.reviewedByEmail}` : ""}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

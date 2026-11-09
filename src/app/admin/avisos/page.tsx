import Link from "next/link";
import { AdminButton } from "@/components/admin-form";
import { getDb } from "@/db/client";
import { listOutbox } from "@/features/avisos/outbox";
import { when } from "@/features/consultas/ui";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";
const label: Record<string, string> = { pendiente: "Pendiente", enviando: "Enviando", enviado: "Enviado", fallido: "Falló" };

/** Avisos por correo: si un envío falla, el cambio de estado se conserva y acá figura pendiente o fallido, con reintento. En la web el estado siempre se puede consultar. */
export default async function AdminAvisos({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  await requireAdmin("/admin/avisos");
  const estado = (await searchParams).estado;
  const rows = await listOutbox(getDb(), { status: estado && label[estado] ? estado : undefined, limit: 200 });
  const pending = rows.filter((r) => r.status === "pendiente" || r.status === "fallido");
  const tab = (v: string | undefined, l: string) => <Link href={v ? `/admin/avisos?estado=${v}` : "/admin/avisos"} aria-current={estado === v ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${estado === v ? "border-ink bg-ink text-paper" : "border-ink/30 hover:bg-white"}`}>{l}</Link>;
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Avisos por correo</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">Pago confirmado, proveedor, llegada a Argentina, entregas parciales, retiro, despacho, problemas y reposición. El canal es el correo; solo reciben avisos las cuentas con correo verificado (los invitados ven el estado en la web). WhatsApp automático no está implementado. Un aviso enviado nunca se reenvía.</p>
      <div className="mt-4 flex flex-wrap gap-2">{tab(undefined, "Todos")}{tab("pendiente", "Pendientes")}{tab("fallido", "Fallidos")}{tab("enviado", "Enviados")}</div>
      {pending.length > 0 && <div className="mt-4"><AdminButton endpoint="/api/admin/avisos" body={{}} label={`Reintentar ${pending.length} sin enviar`} ok="Reintento hecho." /></div>}
      <div className="mt-4 overflow-x-auto rounded-xl border border-ink/15 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="bg-paper-2 text-left text-xs uppercase tracking-wide"><th className="p-2">Cuándo</th><th className="p-2">Aviso</th><th className="p-2">Para</th><th className="p-2">Estado</th><th className="p-2"></th></tr></thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id} id={`aviso-${n.id}`} className="border-t border-ink/10 align-top" data-testid="aviso-correo-fila">
                <td className="p-2 text-xs">{when(n.createdAt)}</td>
                <td className="p-2">{n.subject}{n.inquiryId && <Link href={`/admin/pedidos/${n.inquiryId}`} className="ml-1 font-mono text-xs underline">{n.inquiryId}</Link>}</td>
                <td className="p-2 text-xs">{n.toEmail}</td>
                <td className="p-2"><b className={n.status === "enviado" ? "text-emerald" : "text-vermilion"}>{label[n.status] ?? n.status}</b>{n.attempts > 0 && <span className="block text-xs text-ink/75">{n.attempts} intento(s){n.lastError ? ` · ${n.lastError}` : ""}</span>}</td>
                <td className="p-2 text-right">{n.status !== "enviado" && <AdminButton endpoint="/api/admin/avisos" body={{ ids: [n.id] }} label="Reintentar" ok="Reintento hecho." />}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-ink/75">No hay avisos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

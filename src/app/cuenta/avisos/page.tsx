import type { Metadata } from "next";
import Link from "next/link";
import { AccountHeader, AccountNav } from "@/components/account-shell";
import { CancelRestockButton } from "@/components/cancel-restock-button";
import { getDb } from "@/db/client";
import { listUserAlerts } from "@/features/avisos/reposicion";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mis avisos", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmt = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));
const label: Record<string, string> = { activo: "Esperando reposición", avisado: "Te avisamos", cancelado: "Cancelado" };

export default async function MisAvisos() {
  const user = await requireUser("/cuenta/avisos");
  const alerts = await listUserAlerts(getDb(), user.id);
  return (
    <>
      <AccountHeader eyebrow="Mi cuenta" title="Mis avisos.">
        <p className="mt-3 max-w-2xl text-ink/75">Productos agotados que querés que te avisemos cuando vuelvan. <b>No reservan stock ni garantizan el precio</b> y no son una consulta ni una compra.</p>
      </AccountHeader>
      <AccountNav current="avisos" />
      <div className="paper-texture">
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8">
          {alerts.length === 0 ? (
            <p className="border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70" data-testid="avisos-vacio">No tenés avisos. En un producto agotado vas a ver «Avisame cuando vuelva». <Link href="/sellados" className="font-semibold underline">Ir a la tienda</Link></p>
          ) : (
            <ul className="divide-y divide-ink/15 border border-ink/25 bg-white/70" aria-label="Mis avisos">
              {alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid="aviso-fila">
                  <span><b className="block">{a.title}</b><span className="text-sm text-ink/70">{label[a.status] ?? a.status} · {fmt(a.createdAt)}</span></span>
                  {a.status === "activo" && <CancelRestockButton id={a.id} label="Cancelar aviso" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

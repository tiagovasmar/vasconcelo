import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderTracking } from "@/components/order-tracking";
import { getDb } from "@/db/client";
import { getWhatsappNumber } from "@/features/inquiries/config";
import { customerOrderView, sharedWholesaleStatus } from "@/features/pedidos/service";
import { STAGE_LABEL, type Stage } from "@/features/pedidos/etapas";
import { when } from "@/features/consultas/ui";
import { orderIfAllowed, viewerForPage } from "@/server/pedido-access";

export const metadata: Metadata = { title: "Seguimiento de tu pedido", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * Seguimiento por enlace privado (pensado para quien compró como invitado: el dueño comparte este enlace por WhatsApp). Entra quien tiene la sesión del navegador que hizo el
 * pedido, la cuenta dueña del pedido o el enlace con su clave `?k=`. La referencia sola NO alcanza: sin acceso responde 404 igual que un pedido inexistente.
 */
export default async function Seguimiento({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ k?: string }> }) {
  const { ref } = await params;
  const { k } = await searchParams;
  const db = getDb();
  const who = await viewerForPage(k);
  const found = await orderIfAllowed(db, ref, who);
  const shared = found ? null : await sharedWholesaleStatus(db, ref, who.viewer.accessToken);
  if (!found && !shared) notFound();
  const view = found ? await customerOrderView(db, ref) : null;
  const carrier = shared?.carrier ?? found?.track?.customerCarrier;
  const trackingNumber = shared?.trackingNumber ?? found?.track?.customerTrackingNumber;
  return (
    <div className="paper-texture">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
        <p className="eyebrow text-vermilion">Mi pedido</p>
        <h1 className="display mt-3 text-[clamp(2.4rem,7vw,4.6rem)] normal-case leading-[.95]">Seguimiento.</h1>
        {carrier && trackingNumber && <p className="mt-6 rounded-lg border border-ink/15 bg-white p-4 text-sm">Transportista <b>{carrier}</b> · Guía <b className="break-all font-mono">{trackingNumber}</b></p>}
        {shared ? (
          <section className="mt-6 rounded-xl border border-ink/15 bg-white p-5" data-testid="seguimiento-mayorista-compartido">
            <p className="text-sm">Pedido mayorista <b className="font-mono">{ref}</b></p>
            <h2 className="mt-1 text-xl font-semibold">{shared.cancelledAt !== null ? "Cancelado" : STAGE_LABEL[shared.stage as Stage]}</h2>
            <ol className="mt-4 divide-y divide-ink/10 text-sm" aria-label="Historial de etapas">
              {shared.history.map((event, index) => <li key={index} className="py-2">{STAGE_LABEL[event.stage as Stage]} · {when(event.at)}</li>)}
            </ol>
            <Link href={`/cuenta/ingresar?next=${encodeURIComponent(`/seguimiento/${ref}`)}`} className="mt-4 inline-block text-sm font-semibold underline">Ingresá con tu cuenta para ver pagos y comprobantes</Link>
          </section>
        ) : view ? <OrderTracking view={view} whatsappNumber={getWhatsappNumber()} linkToken={k} /> : <p className="mt-6 border-l-4 border-gold bg-white p-4" data-testid="sin-seguimiento">Tu pedido todavía no tiene seguimiento: la tienda lo abre cuando confirma disponibilidad e importe. Escribinos por WhatsApp con tu referencia <b className="font-mono">{ref}</b>.</p>}
        <p className="mt-8 text-sm"><Link href="/sellados" className="font-semibold underline">Seguir explorando</Link></p>
      </div>
    </div>
  );
}

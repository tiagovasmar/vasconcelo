import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderTracking } from "@/components/order-tracking";
import { getDb } from "@/db/client";
import { getWhatsappNumber } from "@/features/inquiries/config";
import { customerOrderView } from "@/features/pedidos/service";
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
  if (!found) notFound();
  const view = await customerOrderView(db, ref);
  return (
    <div className="paper-texture">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
        <p className="eyebrow text-vermilion">Mi pedido</p>
        <h1 className="display mt-3 text-[clamp(2.4rem,7vw,4.6rem)] normal-case leading-[.95]">Seguimiento.</h1>
        {view ? <OrderTracking view={view} whatsappNumber={getWhatsappNumber()} linkToken={k} /> : <p className="mt-6 border-l-4 border-gold bg-white p-4" data-testid="sin-seguimiento">Tu pedido todavía no tiene seguimiento: la tienda lo abre cuando confirma disponibilidad e importe. Escribinos por WhatsApp con tu referencia <b className="font-mono">{ref}</b>.</p>}
        <p className="mt-8 text-sm"><Link href="/sellados" className="font-semibold underline">Seguir explorando</Link></p>
      </div>
    </div>
  );
}

import { describeDelivery } from "@/features/inquiries/message";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsultaDetail } from "@/components/consulta-detail";
import { OrderTracking } from "@/components/order-tracking";
import { getWhatsappNumber } from "@/features/inquiries/config";
import { customerOrderView } from "@/features/pedidos/service";
import { getDb } from "@/db/client";
import { getInquiryFor } from "@/features/inquiries/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Consulta", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ConsultaDeCuenta({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const user = await requireUser(`/cuenta/consultas/${ref}`);
  // Solo el dueño de la cuenta: una consulta de otro usuario (o de un invitado) responde 404.
  const inquiry = await getInquiryFor(getDb(), ref, { userId: user.id });
  if (!inquiry) notFound();
  const view = await customerOrderView(getDb(), ref);
  if (view?.preorder) return <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-8">
    <Link href="/cuenta/consultas" className="text-sm font-semibold underline">Volver a mis pedidos</Link>
    <h1 className="mt-3 text-3xl font-semibold">Tu preventa</h1>
    <p className="mt-2 text-sm">Entrega elegida · {describeDelivery(inquiry.delivery)}</p>
    <OrderTracking view={view} whatsappNumber={getWhatsappNumber()} />
  </div>;
  return (
    <ConsultaDetail
      tracking={view ? <OrderTracking view={view} whatsappNumber={getWhatsappNumber()} /> : null}
      inquiry={inquiry}
      autoOpen={false}
      links={[
        { href: "/cuenta/consultas", label: "← Mis consultas" },
        { href: "/carrito", label: "Ir al carrito" },
      ]}
    />
  );
}

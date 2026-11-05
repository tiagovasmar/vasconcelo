import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ConsultaDetail } from "@/components/consulta-detail";
import { OrderTracking } from "@/components/order-tracking";
import { getWhatsappNumber } from "@/features/inquiries/config";
import { customerOrderView } from "@/features/pedidos/service";
import { getDb } from "@/db/client";
import { getInquiryFor, hashToken } from "@/features/inquiries/service";
import { SESSION_COOKIE } from "@/server/http";
import { getUser } from "@/server/session";

export const metadata: Metadata = { title: "Tu consulta", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ConsultaPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ abrir?: string }> }) {
  const { ref } = await params;
  const { abrir } = await searchParams;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getUser();
  // Solo quien la preparó (la sesión de invitado o la cuenta) puede verla: la referencia sola no da acceso.
  const inquiry = await getInquiryFor(getDb(), ref, {
    sessionTokenHash: token && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? hashToken(token) : undefined,
    userId: user?.id,
  });
  if (!inquiry) notFound();
  const view = await customerOrderView(getDb(), ref);
  if (view?.preorder && user) redirect(`/cuenta/consultas/${ref}`);

  return (
    <ConsultaDetail
      tracking={view ? <OrderTracking view={view} whatsappNumber={getWhatsappNumber()} /> : null}
      inquiry={inquiry}
      autoOpen={abrir === "1"}
      links={[
        { href: "/carrito", label: "← Volver al carrito (se conserva)" },
        { href: "/sellados", label: "Seguir explorando" },
        ...(user ? [{ href: "/cuenta/consultas", label: "Mis consultas" }] : []),
      ]}
    />
  );
}

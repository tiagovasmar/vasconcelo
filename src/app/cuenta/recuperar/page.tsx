import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/account-shell";
import { ForgotForm, MailUnavailable } from "@/components/auth-forms";
import { localMailActive, mailTransportAvailable } from "@/server/mail";

export const metadata: Metadata = { title: "Recuperar acceso", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function Recuperar() {
  return (
    <AuthCard
      eyebrow="Mi cuenta"
      title="Recuperá tu acceso."
      intro="Te enviamos un enlace para elegir una contraseña nueva."
      footer={<p><Link href="/cuenta/ingresar" className="font-semibold underline">Volver a ingresar</Link></p>}
    >
      {mailTransportAvailable() ? <ForgotForm devMail={localMailActive()} /> : <MailUnavailable what="recuperar el acceso por correo" />}
    </AuthCard>
  );
}

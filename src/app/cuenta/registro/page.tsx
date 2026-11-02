import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/account-shell";
import { GoogleSection, googleErrorMessage, MailUnavailable, RegisterForm } from "@/components/auth-forms";
import { safeNext } from "@/lib/safe-next";
import { localMailActive, mailTransportAvailable } from "@/server/mail";
import { googleEnabled } from "@/server/google";
import { getUser } from "@/server/session";

export const metadata: Metadata = { title: "Crear cuenta", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Registro({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "");
  const gError = googleErrorMessage(sp.error);
  if (await getUser()) redirect(next || "/cuenta");
  return (
    <AuthCard
      eyebrow="Mi cuenta"
      title="Creá tu cuenta."
      intro="Es gratis y opcional. Confirmás tu correo y listo."
      footer={<p>¿Ya tenés cuenta? <Link href={next ? `/cuenta/ingresar?next=${encodeURIComponent(next)}` : "/cuenta/ingresar"} className="font-semibold underline">Ingresar</Link></p>}
    >
      {gError && <p role="alert" className="mb-4 border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm font-semibold">{gError}</p>}
      {googleEnabled() && <GoogleSection next={next || undefined} back="registro" />}
      {mailTransportAvailable() ? <RegisterForm devMail={localMailActive()} next={next || undefined} /> : <MailUnavailable what="crear cuentas nuevas" />}
    </AuthCard>
  );
}

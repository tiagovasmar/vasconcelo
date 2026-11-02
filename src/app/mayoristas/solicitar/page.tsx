import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/account-shell";
import { WholesaleRequestForm } from "@/components/wholesale-form";
import { WholesaleStatusCard } from "@/components/wholesale-status";
import { getDb } from "@/db/client";
import { getWholesaleRequest } from "@/features/wholesale/service";
import { getUser } from "@/server/session";

export const metadata: Metadata = { title: "Solicitar cuenta mayorista", robots: { index: false } };
export const dynamic = "force-dynamic";

const NEXT = "/mayoristas/solicitar";

/** Solicitud de cuenta mayorista: con sesión, la cuenta existente hace la solicitud sin crear otra; sin sesión, se ingresa o se crea una cuenta y se vuelve acá. */
export default async function Solicitar() {
  const user = await getUser();
  if (!user) {
    return (
      <AuthCard
        eyebrow="Mayoristas"
        title="Solicitá tu cuenta mayorista."
        intro="Primero necesitamos tu cuenta: ingresá o creá una y volvés a este paso."
        footer={<p><Link href="/mayoristas" className="font-semibold underline">Ver cómo funciona</Link></p>}
      >
        <div className="grid gap-3" data-testid="mayorista-sin-sesion">
          <Link href={`/cuenta/ingresar?next=${encodeURIComponent(NEXT)}`} className="border border-ink bg-ink p-5 text-paper hover:bg-emerald"><b className="display block text-2xl normal-case">Ya tengo cuenta</b><span className="text-sm">Ingresar y continuar con la solicitud.</span></Link>
          <Link href={`/cuenta/registro?next=${encodeURIComponent(NEXT)}`} className="border border-ink bg-gold p-5 hover:bg-paper"><b className="display block text-2xl normal-case">Crear cuenta</b><span className="text-sm">Nombre, correo y contraseña; confirmás tu correo y seguís.</span></Link>
        </div>
      </AuthCard>
    );
  }
  const existing = await getWholesaleRequest(getDb(), user.id);
  return (
    <AuthCard
      eyebrow="Mayoristas"
      title={existing ? "Tu solicitud." : "Solicitá tu cuenta mayorista."}
      intro="La tienda revisa y aprueba cada cuenta a mano. La solicitud queda pendiente y no activa precios por sí sola."
      footer={<p><Link href="/cuenta" className="font-semibold underline">Volver a mi cuenta</Link> · <Link href="/mayoristas" className="font-semibold underline">Cómo funciona</Link></p>}
    >
      {existing ? <WholesaleStatusCard request={existing} /> : <WholesaleRequestForm userName={user.name} />}
    </AuthCard>
  );
}

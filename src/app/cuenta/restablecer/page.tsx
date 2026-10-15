import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/account-shell";
import { ResetForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Nueva contraseña", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Restablecer({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const invalid = Boolean(error) || !token;
  return (
    <AuthCard eyebrow="Mi cuenta" title="Elegí tu nueva contraseña." footer={<p><Link href="/cuenta/ingresar" className="font-semibold underline">Volver a ingresar</Link></p>}>
      {invalid ? (
        <div role="alert" className="border-l-4 border-vermilion bg-vermilion/10 p-4 text-sm" data-testid="reset-invalido">
          <p className="text-base font-bold">Este enlace no es válido o ya venció.</p>
          <p className="mt-2">Los enlaces valen 1 hora y se usan una sola vez.</p>
          <p className="mt-3"><Link href="/cuenta/recuperar" className="font-semibold underline">Pedir un enlace nuevo</Link></p>
        </div>
      ) : (
        <ResetForm token={token!} />
      )}
    </AuthCard>
  );
}

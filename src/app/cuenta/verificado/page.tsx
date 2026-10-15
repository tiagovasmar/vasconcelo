import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/account-shell";
import { safeNext } from "@/lib/safe-next";
import { getUser } from "@/server/session";

export const metadata: Metadata = { title: "Confirmación de correo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Verificado({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const error = sp.error;
  const next = sp.next ? safeNext(sp.next, "") : "";
  const user = await getUser();
  return (
    <AuthCard eyebrow="Mi cuenta" title={error ? "No pudimos confirmar tu correo." : "¡Correo confirmado!"}>
      {error ? (
        <div role="alert" className="border-l-4 border-vermilion bg-vermilion/10 p-4 text-sm" data-testid="verificacion-invalida">
          <p className="text-base font-bold">El enlace no es válido o ya venció.</p>
          <p className="mt-2">Ingresá con tu correo y tu contraseña y te enviamos un enlace nuevo.</p>
          <p className="mt-3"><Link href="/cuenta/ingresar" className="font-semibold underline">Ir a ingresar</Link></p>
        </div>
      ) : (
        <div role="status" className="border-l-4 border-emerald bg-emerald/10 p-4 text-sm" data-testid="verificacion-ok">
          <p className="text-base font-bold">Tu cuenta está lista.</p>
          <p className="mt-2">{user ? `Iniciamos tu sesión, ${user.name.split(" ")[0]}.` : "Ya podés ingresar con tu correo y tu contraseña."}</p>
          <p className="mt-3"><Link href={user ? next || "/cuenta" : `/cuenta/ingresar${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold underline">{user ? (next ? "Continuar" : "Ir a mi cuenta") : "Ingresar"}</Link></p>
        </div>
      )}
    </AuthCard>
  );
}

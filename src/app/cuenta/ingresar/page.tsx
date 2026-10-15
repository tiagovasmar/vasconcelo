import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/account-shell";
import { LoginForm } from "@/components/auth-forms";
import { safeNext } from "@/lib/safe-next";
import { getUser } from "@/server/session";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ next?: string; motivo?: string; salio?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getUser()) redirect(next);
  const notice = sp.motivo === "favoritos" ? "Iniciá sesión para guardar productos en favoritos." : sp.salio ? "Cerraste sesión. Tu carrito se conserva." : undefined;
  return (
    <AuthCard
      eyebrow="Mi cuenta"
      title="Ingresá."
      intro="Guardá favoritos y mirá tus consultas anteriores."
      footer={<p>¿Todavía no tenés cuenta? <Link href={sp.next ? `/cuenta/registro?next=${encodeURIComponent(next)}` : "/cuenta/registro"} className="font-semibold underline">Crear cuenta</Link></p>}
    >
      <LoginForm next={next} notice={notice} />
    </AuthCard>
  );
}

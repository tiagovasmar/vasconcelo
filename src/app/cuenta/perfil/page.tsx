import type { Metadata } from "next";
import { AccountHeader, AccountNav } from "@/components/account-shell";
import { LogoutButton, PasswordForm, ProfileForm } from "@/components/auth-forms";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Perfil", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Perfil() {
  const user = await requireUser("/cuenta/perfil");
  return (
    <>
      <AccountHeader eyebrow="Mi cuenta" title="Tu perfil." />
      <AccountNav current="perfil" />
      <div className="paper-texture">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 sm:px-8 md:grid-cols-2">
          <section aria-labelledby="datos" className="border border-ink/25 bg-white/80 p-5 sm:p-7">
            <h2 id="datos" className="display text-3xl normal-case">Tus datos</h2>
            <p className="mb-4 mt-1 text-sm text-ink/70">Solo guardamos tu nombre y tu correo. No guardamos direcciones completas ni datos de pago.</p>
            <ProfileForm name={user.name} email={user.email} verified={user.emailVerified} />
          </section>
          <section aria-labelledby="clave" className="border border-ink/25 bg-white/80 p-5 sm:p-7">
            <h2 id="clave" className="display text-3xl normal-case">Contraseña</h2>
            <div className="mt-4"><PasswordForm /></div>
          </section>
          <div><LogoutButton /></div>
        </div>
      </div>
    </>
  );
}

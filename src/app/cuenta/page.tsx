import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AccountHeader, AccountNav } from "@/components/account-shell";
import { LogoutButton } from "@/components/auth-forms";
import { getDb } from "@/db/client";
import { listFavoriteIds } from "@/features/account/favorites";
import { getWholesaleRequest } from "@/features/wholesale/service";
import { wholesaleStatusText } from "@/components/wholesale-status";
import { countGuestInquiries, hashToken, listInquiriesForUser } from "@/features/inquiries/service";
import { SESSION_COOKIE } from "@/server/http";
import { isAdmin } from "@/server/admin";
import { getUser } from "@/server/session";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Cuenta() {
  const user = await getUser();
  if (!user) {
    return (
      <div className="paper-texture">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8 sm:py-16">
          <p className="eyebrow text-vermilion">Mi cuenta</p>
          <h1 className="display mt-3 text-[clamp(2.6rem,8vw,5rem)] normal-case leading-[.95]">Tu cuenta, opcional.</h1>
          <p className="mt-4 max-w-xl text-lg text-ink/80">Con una cuenta guardás favoritos y ves tus consultas anteriores. Para comprar no la necesitás.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Link href="/cuenta/ingresar" className="border border-ink bg-ink p-6 text-paper hover:bg-emerald"><b className="display block text-3xl normal-case">Ingresar</b><span className="text-sm">Ya tengo una cuenta.</span></Link>
            <Link href="/cuenta/registro" className="border border-ink bg-gold p-6 hover:bg-paper"><b className="display block text-3xl normal-case">Crear cuenta</b><span className="text-sm">Solo nombre, correo y contraseña.</span></Link>
          </div>
          <p className="mt-8 text-sm"><Link href="/sellados" className="font-semibold underline">Seguir como invitado</Link></p>
        </div>
      </div>
    );
  }
  const db = getDb();
  const consultas = (await listInquiriesForUser(db, user.id)).length;
  const favoritos = (await listFavoriteIds(db, user.id)).length;
  const mayorista = await getWholesaleRequest(db, user.id);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const guest = token && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? await countGuestInquiries(db, hashToken(token)) : 0;

  return (
    <>
      <AccountHeader eyebrow="Mi cuenta" title={`Hola, ${user.name.split(" ")[0]}.`}>
        <p className="mt-3 text-ink/75">{user.email}</p>
      </AccountHeader>
      <AccountNav current="resumen" />
      <div className="paper-texture">
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <li><Link href="/cuenta/consultas" className="block h-full border border-ink/25 bg-white/70 p-5 hover:border-ink"><span className="display block text-5xl">{consultas}</span><b>Mis consultas</b><span className="block text-sm text-ink/70">Pedidos que preparaste para consultar por WhatsApp.</span></Link></li>
            <li><Link href="/cuenta/favoritos" className="block h-full border border-ink/25 bg-white/70 p-5 hover:border-ink"><span className="display block text-5xl">{favoritos}</span><b>Favoritos</b><span className="block text-sm text-ink/70">Productos sellados que guardaste.</span></Link></li>
            <li><Link href="/cuenta/perfil" className="block h-full border border-ink/25 bg-white/70 p-5 hover:border-ink"><span className="display block text-5xl">1</span><b>Perfil</b><span className="block text-sm text-ink/70">Tu nombre, tu correo y tu contraseña.</span></Link></li>
            <li><Link href="/mayoristas/solicitar" className="block h-full border border-ink/25 bg-white/70 p-5 hover:border-ink" data-testid="card-mayorista"><span className="display block text-3xl normal-case leading-tight sm:text-4xl" data-testid="card-mayorista-estado">{mayorista ? wholesaleStatusText[mayorista.status].label : "Sin solicitar"}</span><b>Cuenta mayorista</b><span className="block text-sm text-ink/70">{mayorista ? "Estado de tu solicitud. No activa descuentos por sí sola." : "30% sobre el precio minorista, sujeto a condiciones por definir."}</span></Link></li>
          </ul>
          {guest > 0 && (
            <p className="mt-6 border-l-4 border-emerald bg-emerald/10 p-4 text-sm">Tenés {guest} {guest === 1 ? "consulta" : "consultas"} de invitado en este navegador. <Link href="/cuenta/consultas" className="font-bold underline">Agregalas a tu cuenta</Link>.</p>
          )}
          {isAdmin(user) && <p className="mt-6 text-sm"><Link href="/admin" className="font-semibold underline underline-offset-4" data-testid="link-admin">Panel del dueño: precios y stock</Link></p>}
          <div className="mt-8"><LogoutButton /></div>
        </div>
      </div>
    </>
  );
}

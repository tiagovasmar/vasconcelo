import type { Metadata } from "next";
import Link from "next/link";
import { WholesaleCatalog } from "@/components/wholesale-catalog";
import { getDb } from "@/db/client";
import { wholesaleAccess, wholesaleCatalog } from "@/features/mayorista/precios";
import { isAdmin } from "@/server/admin";
import { getUser } from "@/server/session";

export const metadata: Metadata = { title: "Catálogo mayorista", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NEXT = "/mayoristas/catalogo";

/**
 * Catálogo mayorista: SOLO para cuentas aprobadas por la tienda, validado en el servidor (sesión + solicitud aprobada + condiciones definidas). Para cualquier otra persona
 * esta página no contiene ni un precio mayorista: los datos ni siquiera se consultan.
 */
export default async function CatalogoMayorista() {
  const user = await getUser();
  const db = getDb();
  const access = await wholesaleAccess(db, user?.id ?? null);
  if (!access.ok) {
    const msg = {
      no_session: { t: "Ingresá con tu cuenta.", b: "El catálogo mayorista es solo para cuentas mayoristas aprobadas.", a: { href: `/cuenta/ingresar?next=${encodeURIComponent(NEXT)}`, l: "Ingresar" } },
      sin_solicitud: { t: "Todavía no solicitaste la cuenta.", b: "Solicitá tu cuenta mayorista: la tienda la revisa y la aprueba a mano.", a: { href: "/mayoristas/solicitar", l: "Solicitar cuenta mayorista" } },
      pendiente: { t: "Tu solicitud está pendiente.", b: "La tienda todavía no aprobó tu cuenta. Una vez aprobada, vas a ver los precios por tramo cuando el catálogo esté abierto.", a: { href: "/cuenta", l: "Ver el estado en Mi cuenta" } },
      rechazada: { t: "La solicitud no fue aprobada.", b: "Si querés más información, consultá con la tienda por WhatsApp.", a: { href: "/mayoristas", l: "Cómo funcionan los mayoristas" } },
      cerrado: { t: "El catálogo mayorista todavía no está habilitado.", b: "Tu cuenta ya está aprobada. Podés volver a esta página para ver los precios por tramo cuando la tienda abra el catálogo.", a: { href: "/mayoristas", l: "Cómo funcionan los mayoristas" } },
    }[access.reason];
    return (
      <div className="paper-texture">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-8 sm:py-16" data-testid="mayorista-sin-acceso">
          <p className="eyebrow text-vermilion">Mayoristas</p>
          <h1 className="display mt-3 text-[clamp(2.2rem,7vw,4rem)] normal-case leading-[.95]">{msg.t}</h1>
          <p className="mt-4 text-lg text-ink/80">{msg.b}</p>
          <Link href={msg.a.href} className="mt-6 inline-flex min-h-12 items-center bg-gold px-6 font-bold hover:bg-ink hover:text-paper">{msg.a.l}</Link>
          {isAdmin(user) && <Link href="/admin/mayoristas" className="ml-3 mt-3 inline-flex min-h-12 items-center border border-ink/25 px-5 font-semibold">Configurar y descargar catálogo</Link>}
        </div>
      </div>
    );
  }
  const { rows, rules, rate10k } = await wholesaleCatalog(db);
  return (
    <div className="paper-texture">
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-12">
        <p className="eyebrow text-vermilion">Mayoristas</p>
        <h1 className="display mt-3 text-[clamp(2.4rem,7vw,4.6rem)] normal-case leading-[.95]">Catálogo mayorista.</h1>
        <p className="mt-3 max-w-3xl text-ink/80">Somos distribuidores de productos originales de Asia y vendemos exclusivamente por pedido. Elegí las cantidades para ver el precio en USD según el tramo. Los precios pueden variar levemente según el mercado de reventa en origen. Te confirmamos el importe antes de que pagues la seña.</p>
        <div className="mt-6"><WholesaleCatalog rows={rows} rules={rules} rate10k={rate10k} defaultName={user?.name ?? ""} /></div>
      </div>
    </div>
  );
}

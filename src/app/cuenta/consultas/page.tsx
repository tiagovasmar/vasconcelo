import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AccountHeader, AccountNav } from "@/components/account-shell";
import { ClaimGuestCard } from "@/components/auth-forms";
import { getDb } from "@/db/client";
import { countGuestInquiries, hashToken, listInquiriesForUser } from "@/features/inquiries/service";
import { formatARS } from "@/lib/format";
import { SESSION_COOKIE } from "@/server/http";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mis consultas", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmt = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));
const statusLabel: Record<string, string> = { consulta_preparada: "Consulta preparada" };

export default async function MisConsultas() {
  const user = await requireUser("/cuenta/consultas");
  const db = getDb();
  const items = await listInquiriesForUser(db, user.id);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const guest = token && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? await countGuestInquiries(db, hashToken(token)) : 0;

  return (
    <>
      <AccountHeader eyebrow="Mi cuenta" title="Mis consultas.">
        <p className="mt-3 max-w-2xl text-ink/75">Acá ves los pedidos que preparaste para consultar por WhatsApp. <b>No son compras ni pagos</b>: la disponibilidad, el importe final, el pago y la entrega se acuerdan en el chat con la tienda.</p>
      </AccountHeader>
      <AccountNav current="consultas" />
      <div className="paper-texture">
        <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-10 sm:px-8">
          <ClaimGuestCard count={guest} />
          {items.length === 0 ? (
            <div className="border border-dashed border-ink/40 bg-white/60 p-8 text-center sm:p-14" data-testid="consultas-vacio">
              <p className="display text-4xl normal-case">Todavía no preparaste consultas.</p>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink/70">Armá tu carrito y tocá «Continuar por WhatsApp»: la consulta queda guardada acá.</p>
              <Link href="/sellados" className="mt-6 inline-block bg-gold px-6 py-3.5 font-bold hover:bg-ink hover:text-paper">Explorar sellados</Link>
            </div>
          ) : (
            <ul className="divide-y divide-ink/15 border border-ink/25 bg-white/70" aria-label="Mis consultas">
              {items.map((q) => (
                <li key={q.reference}>
                  <Link href={`/cuenta/consultas/${q.reference}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-gold/20 sm:p-5">
                    <span>
                      <b className="block">{q.reference}</b>
                      <span className="text-sm text-ink/70">{fmt(q.createdAt)} · {q.units} {q.units === 1 ? "unidad" : "unidades"} en {q.lineCount} {q.lineCount === 1 ? "producto" : "productos"}</span>
                    </span>
                    <span className="text-right">
                      <span className="inline-block border border-ink/40 bg-paper px-2 py-0.5 text-xs font-bold uppercase tracking-wide">{statusLabel[q.status] ?? q.status}</span>
                      <span className="mt-1 block text-sm">{q.encargoLines > 0 && q.subtotalMinor === 0 ? <b>Por encargo · sin cotizar</b> : <>Subtotal de productos <b>{formatARS(q.subtotalMinor)}</b>{q.encargoLines > 0 && <> · más {q.encargoLines} por encargo</>}</>}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

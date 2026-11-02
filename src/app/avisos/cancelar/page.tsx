import type { Metadata } from "next";
import Link from "next/link";
import { CancelRestockButton } from "@/components/cancel-restock-button";

export const metadata: Metadata = { title: "Cancelar aviso", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Cancelar un aviso de reposición con el enlace del correo. Pide confirmación: abrir el enlace no cancela nada por sí solo. */
export default async function CancelarAviso({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = (await searchParams).t ?? "";
  return (
    <div className="paper-texture">
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-8 sm:py-16">
        <p className="eyebrow text-vermilion">Avisos de reposición</p>
        <h1 className="display mt-3 text-[clamp(2.2rem,7vw,4rem)] normal-case leading-[.95]">Cancelar el aviso.</h1>
        {token && token.length < 200 ? (
          <>
            <p className="mt-4 text-lg text-ink/80">Si lo cancelás, no te vamos a escribir cuando este producto vuelva a estar disponible.</p>
            <div className="mt-6"><CancelRestockButton token={token} /></div>
          </>
        ) : (
          <p className="mt-4 text-lg text-ink/80" role="alert">El enlace no es válido. Usá el enlace completo del correo o cancelá el aviso desde tu cuenta.</p>
        )}
        <p className="mt-8 text-sm"><Link href="/sellados" className="font-semibold underline">Volver a la tienda</Link></p>
      </div>
    </div>
  );
}

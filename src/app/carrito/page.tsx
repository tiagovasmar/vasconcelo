import type { Metadata } from "next";
import Link from "next/link";
import { CartView } from "@/components/cart-view";
import { getWhatsappNumber } from "@/features/inquiries/config";

export const metadata: Metadata = { title: "Carrito" };
// El estado de WhatsApp (configurado o demo) se lee al responder, no al compilar.
export const dynamic = "force-dynamic";

export default function CarritoPage() {
  return (
    <div className="paper-texture">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-8 sm:py-10">
        <nav aria-label="Ruta" className="text-sm text-ink/70">
          <Link href="/" className="hover:underline">Inicio</Link> / <span aria-current="page" className="font-semibold text-ink">Carrito</span>
        </nav>
        <h1 className="display mt-2 text-[clamp(1.8rem,7vw,5rem)] normal-case leading-[.95] sm:mt-4">Tu próxima apertura, a un mensaje.</h1>
        <p className="mt-1.5 max-w-xl text-base text-emerald sm:mt-3 sm:text-lg">Revisá tu pedido y coordinamos por WhatsApp.</p>
        <div className="mt-4 min-h-[70vh] sm:mt-8">
          <CartView whatsappConfigured={Boolean(getWhatsappNumber())} />
        </div>
      </div>
    </div>
  );
}

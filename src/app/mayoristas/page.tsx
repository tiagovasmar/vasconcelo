import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { encargo, mayorista } from "@/content/politicas";

export const metadata: Metadata = {
  title: "Mayoristas",
  description: "Catálogo mayorista por pedido, con precios según la cantidad, para cuentas que la tienda aprueba. Solicitá tu cuenta.",
};

/** Lo que el dueño todavía no definió: se muestra tal cual, sin inventar valores. */
const pendientes = [
  "La compra mínima.",
  "Si se pueden combinar productos para alcanzar el mínimo o cada tramo de precio.",
  "Las cantidades y los precios de cada tramo.",
  "Las demoras estimadas.",
];

export default function Mayoristas() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink text-paper" aria-labelledby="may-title">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,#1f8a63_0%,#0b4032_40%,#121715_85%)]" aria-hidden="true" />
        <div className="grid-lines absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
          <p className="eyebrow text-vermilion-bright">Mayoristas</p>
          <h1 id="may-title" className="display mt-3 text-[clamp(2.4rem,8vw,5.4rem)]">Pedidos por cantidad, <span className="text-gold">con precio por tramo.</span></h1>
          <p className="mt-4 max-w-2xl text-paper/85">Catálogo mayorista <b>exclusivamente por pedido</b> para cuentas que la tienda aprueba a mano. El precio unitario baja según la cantidad que pidas. Solicitar la cuenta no la activa al instante: queda pendiente de revisión.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/mayoristas/solicitar" className="inline-flex min-h-12 items-center gap-3 bg-gold px-6 py-3 font-bold text-ink hover:bg-paper" data-testid="solicitar-cuenta-mayorista">Solicitar cuenta mayorista <ArrowIcon /></Link>
            <Link href="/mayoristas/catalogo" className="inline-flex min-h-12 items-center border border-paper/60 px-6 py-3 font-semibold hover:bg-paper hover:text-ink" data-testid="mayorista-catalogo-link">Ir al catálogo mayorista</Link>
          </div>
        </div>
      </section>

      <div className="paper-texture">
        <div className="mx-auto max-w-[1440px] space-y-14 px-4 py-12 sm:px-8 sm:py-16">
          <section aria-labelledby="may-que" className="max-w-3xl">
            <p className="eyebrow text-vermilion">01 / Cómo funciona</p>
            <h2 id="may-que" className="display mt-2 text-4xl normal-case sm:text-5xl">Qué incluye</h2>
            <ul className="mt-5 space-y-4 text-base leading-relaxed">
              <li><b>Solo por pedido.</b> El stock que ves en la tienda minorista no es stock mayorista: la tienda confirma la disponibilidad y el importe de cada pedido antes de pedirte la seña.</li>
              <li><b>Cuenta aprobada por la tienda.</b> Solicitás la cuenta y la tienda la revisa y la aprueba manualmente. Los precios mayoristas solo se muestran a cuentas aprobadas.</li>
              <li><b>Precio según la cantidad.</b> Cada producto tiene tramos de cantidad con su precio unitario. Si todavía no llegás al primer tramo, o no hay precio, figura «A cotizar».</li>
              <li><b>Pago.</b> {mayorista.paymentNote} No se aplican el 10% OFF por transferencia ni las 3 cuotas sin interés de la venta minorista.</li>
              <li><b>Seña y saldo.</b> Después de confirmar disponibilidad e importe, se abona una seña del {mayorista.senaPercent}%. El resto se paga al retirar o antes del despacho, cuando la mercadería ya llegó a Argentina. Si el paquete se pierde o un problema impide cumplir el pedido, se reintegra la seña.</li>
              <li><b>Seguimiento.</b> Ves cada etapa de tu pedido en <Link href="/cuenta/consultas" className="underline">Mi cuenta</Link>, con fechas reales, y recibís avisos por correo cuando hay novedades. Los pedidos pueden llegar y entregarse en partes.</li>
              <li><b>Financiación.</b> Podés consultar la financiación de mercadería a 3 o 6 meses. Es solo una consulta: no se promete aprobación, cuotas ni tasas.</li>
            </ul>
          </section>

          <section aria-labelledby="may-pend" className="max-w-3xl border-l-4 border-gold bg-white/70 p-5" data-testid="mayorista-pendiente">
            <p className="eyebrow text-vermilion">02 / Condiciones por definir</p>
            <h2 id="may-pend" className="display mt-2 text-3xl normal-case sm:text-4xl">Lo que todavía no está definido</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {pendientes.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <p className="mt-3 text-sm text-ink/75">Hasta que la tienda las defina y abra el catálogo, no hay precios mayoristas publicados ni demoras prometidas. La demora estimada se informa antes de pagar la seña, indicando desde qué momento se cuenta; no hay fechas garantizadas.</p>
          </section>

          <section aria-labelledby="may-encargo" className="max-w-3xl">
            <p className="eyebrow text-vermilion">03 / Encargos minoristas</p>
            <h2 id="may-encargo" className="display mt-2 text-4xl normal-case sm:text-5xl">¿Querés un producto puntual?</h2>
            <p className="mt-4 text-base leading-relaxed">Para una unidad o pocas, podés <b>traer a pedido</b> productos del catálogo con una seña del {encargo.senaPercent}% del importe confirmado. En cada ficha, «Consultar por encargo» arma la consulta.</p>
            <Link href="/sellados" className="mt-5 inline-flex items-center gap-3 bg-ink px-6 py-3.5 font-bold text-paper hover:bg-emerald">Ver el catálogo <ArrowIcon /></Link>
          </section>

          <section aria-labelledby="may-pasos" className="max-w-3xl">
            <p className="eyebrow text-vermilion">04 / Cómo solicitarla</p>
            <h2 id="may-pasos" className="display mt-2 text-4xl normal-case sm:text-5xl">Tres pasos</h2>
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-base">
              <li>Ingresá con tu cuenta (también con Google) o creá una.</li>
              <li>Completá el nombre comercial o actividad, tu localidad y, si querés, qué volumen te interesa.</li>
              <li>Guardamos tu solicitud y ves su estado en <Link href="/cuenta" className="underline">Mi cuenta</Link>.</li>
            </ol>
            <Link href="/mayoristas/solicitar" className="mt-6 inline-flex min-h-12 items-center gap-3 bg-gold px-6 py-3 font-bold hover:bg-ink hover:text-paper">Solicitar cuenta mayorista <ArrowIcon /></Link>
          </section>
        </div>
      </div>
    </>
  );
}

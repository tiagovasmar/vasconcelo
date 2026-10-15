import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { encargo, mayorista } from "@/content/politicas";
import { ENCARGO_EXPLICACION } from "@/features/politicas/encargos";

export const metadata: Metadata = {
  title: "Mayoristas",
  description: `Cuenta mayorista con ${mayorista.discountPercent}% de descuento sobre el precio minorista de catálogo, sujeto a condiciones por definir. Solicitá cotizar pedidos mayoristas y por encargo.`,
};

const pendientes = [
  "La compra mínima (por importe o por unidades).",
  "Si el 30% se acumula con el 10% OFF por transferencia o con las cuotas sin interés.",
  "Si las cuentas se aprueban de forma manual o automática.",
];

export default function Mayoristas() {
  const pct = mayorista.discountPercent;
  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink text-paper" aria-labelledby="may-title">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,#1f8a63_0%,#0b4032_40%,#121715_85%)]" aria-hidden="true" />
        <div className="grid-lines absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
          <p className="eyebrow text-vermilion-bright">Mayoristas</p>
          <h1 id="may-title" className="display mt-3 text-[clamp(2.4rem,8vw,5.4rem)]">{pct}% sobre el precio minorista <span className="text-gold">para tu cuenta mayorista.</span></h1>
          <p className="mt-4 max-w-2xl text-paper/85">El beneficio es del {pct}% de descuento sobre el precio minorista de catálogo, <b>sujeto a las condiciones mayoristas que la tienda todavía está definiendo</b>. Solicitar la cuenta no lo activa al instante: la solicitud queda pendiente de revisión.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/mayoristas/solicitar" className="inline-flex min-h-12 items-center gap-3 bg-gold px-6 py-3 font-bold text-ink hover:bg-paper" data-testid="solicitar-cuenta-mayorista">Solicitar cuenta mayorista <ArrowIcon /></Link>
            <Link href="/cuenta/ingresar?next=%2Fmayoristas%2Fsolicitar" className="inline-flex min-h-12 items-center border border-paper/60 px-6 py-3 font-semibold hover:bg-paper hover:text-ink" data-testid="mayorista-ya-tengo-cuenta">Ya tengo cuenta</Link>
          </div>
        </div>
      </section>

      <div className="paper-texture">
        <div className="mx-auto max-w-[1440px] space-y-14 px-4 py-12 sm:px-8 sm:py-16">
          <section aria-labelledby="may-que" className="max-w-3xl">
            <p className="eyebrow text-vermilion">01 / Beneficio</p>
            <h2 id="may-que" className="display mt-2 text-4xl normal-case sm:text-5xl">Qué incluye</h2>
            <ul className="mt-5 space-y-4 text-base leading-relaxed">
              <li><b>{pct}% de descuento</b> sobre el precio minorista de catálogo. La base de comparación es el precio de lista publicado en la tienda.</li>
              <li><b>Todo el catálogo publicado.</b> Podés pedir cotización por los artículos que ves en la tienda, sujeto a disponibilidad. Cada ficha indica si tiene precio y stock confirmados.</li>
              <li><b>Pedidos por encargo.</b> Podés consultar que se traigan artículos del catálogo. El proveedor, la variante, el contenido, la disponibilidad, la cotización y la fecha se confirman antes de comprometer el pedido. Consultar no reserva mercadería.</li>
            </ul>
          </section>

          <section aria-labelledby="may-encargo" className="max-w-3xl">
            <p className="eyebrow text-vermilion">02 / Encargos</p>
            <h2 id="may-encargo" className="display mt-2 text-4xl normal-case sm:text-5xl">Consultar por encargo</h2>
            <p className="mt-4 text-base leading-relaxed">{ENCARGO_EXPLICACION}</p>
            <p className="mt-3 text-sm text-ink/75">Todavía no está definido si el {pct}% o las promociones aplican a un encargo, ni los plazos, la devolución de la seña o la vigencia de la cotización: se informan cuando estén confirmados. Hoy ninguna de esas condiciones se da por sentada.</p>
            <Link href="/sellados" className="mt-5 inline-flex items-center gap-3 bg-ink px-6 py-3.5 font-bold text-paper hover:bg-emerald">Ver el catálogo <ArrowIcon /></Link>
            <p className="mt-2 text-xs text-ink/60">En cada ficha, «Consultar por encargo» arma la consulta (la seña del {encargo.senaPercent}% se informa recién con la cotización confirmada).</p>
          </section>

          <section aria-labelledby="may-pend" className="max-w-3xl border-l-4 border-gold bg-white/70 p-5" data-testid="mayorista-pendiente">
            <p className="eyebrow text-vermilion">03 / Condiciones por definir</p>
            <h2 id="may-pend" className="display mt-2 text-3xl normal-case sm:text-4xl">Lo que todavía no está definido</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {pendientes.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <p className="mt-3 text-sm text-ink/75">Hasta que se definan, las solicitudes quedan en estado «pendiente», no se aplica ningún precio mayorista y no se acumulan descuentos.</p>
          </section>

          <section aria-labelledby="may-pasos" className="max-w-3xl">
            <p className="eyebrow text-vermilion">04 / Cómo solicitarla</p>
            <h2 id="may-pasos" className="display mt-2 text-4xl normal-case sm:text-5xl">Tres pasos</h2>
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-base">
              <li>Ingresá con tu cuenta o creá una (es gratis; confirmás tu correo).</li>
              <li>Completá el nombre comercial o actividad, tu localidad y, si querés, qué artículos o volumen te interesan.</li>
              <li>Guardamos tu solicitud y ves su estado en <Link href="/cuenta" className="underline">Mi cuenta</Link>.</li>
            </ol>
            <Link href="/mayoristas/solicitar" className="mt-6 inline-flex min-h-12 items-center gap-3 bg-gold px-6 py-3 font-bold hover:bg-ink hover:text-paper">Solicitar cuenta mayorista <ArrowIcon /></Link>
          </section>
        </div>
      </div>
    </>
  );
}

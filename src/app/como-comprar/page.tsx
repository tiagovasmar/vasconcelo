import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, CartIcon, ChatIcon, CubeIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Cómo comprar",
  description: "De tu carrito a tu próxima apertura: cómo armar el pedido, coordinar por WhatsApp y acordar pago y entrega.",
};

const steps = [
  { icon: <CartIcon />, title: "Armá tu carrito", text: "Sumá los productos sellados que quieras. No hace falta cuenta: podés comprar como invitado." },
  { icon: <CubeIcon />, title: "Elegí entrega y pago", text: "Andreani, moto en CABA y AMBA o retiro en Av. Rivadavia 14600. En compras que incluyan al menos una caja: tarjeta de crédito en 3 cuotas sin interés o 10% OFF por transferencia. El pago se coordina por WhatsApp." },
  { icon: <ChatIcon />, title: "Continuá por WhatsApp", text: "Se abre el chat con tu pedido ya escrito. Solo tenés que enviarlo (o copiarlo si preferís)." },
  { icon: <ArrowIcon />, title: "Confirmamos con vos", text: "La tienda confirma disponibilidad e importe final. Ahí se acuerdan el pago y la entrega." },
];

const faqs: Array<[string, React.ReactNode]> = [
  ["¿Qué formas de pago aceptan?", "Las compras que incluyan al menos una caja pueden elegir 3 cuotas sin interés con tarjeta de crédito o 10% OFF por transferencia (son alternativas: no se acumulan). Con sobres solos esas promociones no aplican. El descuento se calcula sobre los productos del pedido; el envío se coordina por separado. Elegí tu preferencia en el carrito y confirmamos el importe en WhatsApp."],
  ["¿Qué es un encargo?", "Es una consulta por un producto sin precio o stock confirmado (o agotado). Consultar no reserva mercadería ni compromete el pedido: el proveedor, la disponibilidad, la cotización y la fecha se confirman antes. Una vez cotizado, podés encargar abonando una seña del 20%; el saldo (80%) y la entrega se coordinan con la tienda. Los plazos, la devolución de la seña y la vigencia de la cotización se informan cuando estén definidos."],
  ["¿Hay precios mayoristas?", <>Hay una cuenta mayorista con 30% sobre el precio minorista de catálogo, sujeta a condiciones que la tienda todavía define (compra mínima, acumulación con otros descuentos y aprobación). <Link href="/mayoristas" className="underline">Más información y solicitud</Link>.</>],
  ["¿Pago en la web?", "No. En el sitio no se cobra nada ni se piden datos bancarios. El pago se acuerda con la tienda por WhatsApp."],
  ["¿Abrir WhatsApp confirma mi compra?", "No. Abrir el chat no confirma pago, reserva ni venta. Hasta que la tienda te confirme en el chat, el pedido es una consulta."],
  ["¿Por qué el envío figura «a coordinar»?", "Porque el costo y el plazo dependen de la localidad y del medio elegido, y la tienda los confirma por WhatsApp. El sitio muestra el subtotal de productos, no un importe final."],
  ["¿El stock se reserva al preparar la consulta?", "No. El stock se actualiza manualmente y la disponibilidad se confirma en el chat."],
  ["¿Qué contiene un sobre o una caja?", "El contenido es aleatorio. En cada ficha separamos las cantidades físicas (por ejemplo, sobres por caja) de las garantías documentadas, y mostramos la fuente y la fecha de revisión. Si un dato no está disponible, lo decimos."],
  ["¿Las probabilidades son oficiales?", "Solo las marcamos como oficiales cuando una fuente las publica para ese producto, idioma y región. Si no hay evidencia, figura «Dato no disponible» (no significa 0 %)."],
  ["¿Necesito una cuenta?", <>No. Con cuenta podés guardar favoritos y ver «Mis consultas». <Link href="/cuenta" className="underline">Más sobre la cuenta</Link>.</>],
  ["¿Puedo editar el pedido después de prepararlo?", "Sí: tu carrito se conserva. Si cambiás algo y preparás otra consulta, se crea una nueva con su propia referencia."],
];

export default function ComoComprar() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink text-paper">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,#1f8a63_0%,#0b4032_40%,#121715_85%)]" aria-hidden="true" />
        <div className="grid-lines absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
          <p className="eyebrow text-vermilion-bright">Cómo comprar</p>
          <h1 className="display mt-3 text-[clamp(2.6rem,9vw,6rem)]">De tu carrito <span className="text-gold">a tu próxima apertura.</span></h1>
          <p className="mt-4 max-w-xl text-paper/80">Armás el pedido en la web y lo coordinás por WhatsApp. Sin pagos en línea y sin obligación de crear una cuenta.</p>
        </div>
      </section>

      <div className="paper-texture">
        <div className="mx-auto max-w-[1440px] space-y-16 px-4 py-12 sm:px-8 sm:py-16">
          <section aria-labelledby="pasos">
            <p className="eyebrow text-vermilion">01 / Pasos</p>
            <h2 id="pasos" className="display mt-2 text-4xl normal-case sm:text-5xl">Cuatro pasos</h2>
            <ol className="mt-6 grid gap-px bg-ink/15 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <li key={s.title} className="relative bg-paper p-6">
                  <span className="display absolute right-4 top-2 text-[4.5rem] leading-none text-ink/10" aria-hidden="true">{i + 1}</span>
                  <span className="text-emerald">{s.icon}</span>
                  <h3 className="mt-4 text-lg font-bold">{i + 1}. {s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink/80">{s.text}</p>
                </li>
              ))}
            </ol>
            <Link href="/sellados" className="mt-6 inline-flex items-center gap-3 bg-gold px-6 py-3.5 font-bold hover:bg-ink hover:text-paper">Explorar la tienda <ArrowIcon /></Link>
          </section>

          <section id="envios" aria-labelledby="h-envios" className="scroll-mt-6">
            <p className="eyebrow text-vermilion">02 / Entregas</p>
            <h2 id="h-envios" className="display mt-2 text-4xl normal-case sm:text-5xl">Envíos y retiros</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="border border-ink/25 bg-white/70 p-5"><h3 className="text-lg font-bold">Andreani</h3><p className="mt-2 text-sm leading-relaxed text-ink/80">Envío a todo el país. Te pedimos localidad, provincia y código postal. El costo y el plazo se coordinan por WhatsApp.</p></div>
              <div className="border border-ink/25 bg-white/70 p-5"><h3 className="text-lg font-bold">Moto en CABA y AMBA</h3><p className="mt-2 text-sm leading-relaxed text-ink/80">Te pedimos localidad y código postal. La cobertura de tu zona se confirma por WhatsApp: no todas las direcciones están cubiertas.</p></div>
              <div className="border border-ink/25 bg-white/70 p-5"><h3 className="text-lg font-bold">Retiro en Av. Rivadavia 14600</h3><p className="mt-2 text-sm leading-relaxed text-ink/80">Consultá por WhatsApp el horario para retirar y la dirección exacta antes de ir.</p></div>
            </div>
            <p className="mt-4 max-w-2xl text-sm text-ink/70">No pedimos DNI ni dirección completa para preparar la consulta.</p>
          </section>

          <section id="preguntas" aria-labelledby="h-faq" className="scroll-mt-6 max-w-3xl">
            <p className="eyebrow text-vermilion">03 / Preguntas frecuentes</p>
            <h2 id="h-faq" className="display mt-2 text-4xl normal-case sm:text-5xl">Lo que más nos preguntan</h2>
            <div className="mt-6 divide-y divide-ink/15 border-y border-ink/25">
              {faqs.map(([q, a]) => (
                <details key={q} className="group py-1">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-lg font-bold">
                    {q} <span aria-hidden="true" className="text-2xl transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-4 pr-8 leading-relaxed text-ink/85">{a}</p>
                </details>
              ))}
            </div>
            <p className="mt-6 text-sm text-ink/70">Más detalle en <Link href="/condiciones" className="underline">Condiciones</Link> y <Link href="/privacidad" className="underline">Privacidad</Link> (borradores).</p>
          </section>
        </div>
      </div>
    </>
  );
}

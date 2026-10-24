import Link from "next/link";
import { ConsultaActions } from "@/components/consulta-actions";
import { getWhatsappNumber } from "@/features/inquiries/config";
import { describeDelivery } from "@/features/inquiries/message";
import { launchFor, type InquiryView } from "@/features/inquiries/service";
import { languageLabel } from "@/content/labels";
import { formatARS } from "@/lib/format";
import { formatRate, formatUSD } from "@/features/fx/convert";
import { encargo } from "@/content/politicas";

const fmt = (ms: number) =>
  new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));

/** Detalle de una consulta (invitado o cuenta). Siempre «consulta preparada»: nunca una compra ni un pago. */
export function ConsultaDetail({ inquiry, autoOpen, links }: { inquiry: InquiryView; autoOpen: boolean; links: Array<{ href: string; label: string }> }) {
  const number = getWhatsappNumber();
  const launch = launchFor(inquiry, number);
  const summary = launch.mode === "summary";
  const hasEncargo = inquiry.lines.some((l) => l.fulfillment === "encargo");
  const hasStock = inquiry.lines.some((l) => l.fulfillment === "stock");

  return (
    <div className="paper-texture">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
        <p className="eyebrow text-vermilion">Consulta preparada · {inquiry.reference}</p>
        <h1 className="display mt-3 text-[clamp(2.4rem,7vw,4.6rem)] normal-case leading-[.95]">Tu pedido está listo para enviar.</h1>
        <p className="mt-4 max-w-2xl text-lg">
          <b>Todavía no enviaste nada.</b> Abrir WhatsApp no confirma pago, reserva ni venta: la disponibilidad y el importe final se acuerdan en el chat con la tienda.
        </p>

        {!number && (
          <div role="note" className="mt-6 border-l-4 border-vermilion bg-vermilion/10 p-4 text-sm" data-testid="modo-demo">
            <b>Modo demostración.</b> Todavía no hay un número de WhatsApp configurado, así que no se abre ningún chat. Podés revisar la vista previa y copiar el mensaje.
          </div>
        )}
        {summary && (
          <div role="note" className="mt-6 border-l-4 border-emerald bg-emerald/10 p-4 text-sm" data-testid="modo-resumen">
            <b>Es un pedido grande.</b> {number ? "Se abre el chat con un resumen y tu referencia; " : "Para evitar enlaces demasiado largos, el chat se abriría con un resumen y tu referencia; "}
            copiá el detalle completo y pegalo a continuación. No se omite ningún producto ni precio.
          </div>
        )}

        <div className="mt-6">
          <ConsultaActions waUrl={launch.url} text={launch.text} fullText={inquiry.message} summaryMode={summary} autoOpen={autoOpen && Boolean(launch.url)} />
        </div>

        <section aria-labelledby="mensaje-title" className="mt-8 border border-ink/25 bg-white/70 p-5">
          <h2 id="mensaje-title" className="display text-2xl normal-case">{summary ? "Detalle completo del pedido" : "Mensaje preparado"}</h2>
          <pre className="mt-3 whitespace-pre-wrap break-words border border-ink/15 bg-paper-2 p-3 font-mono text-xs leading-relaxed sm:text-sm" data-testid="mensaje">{inquiry.message}</pre>
          {summary && (
            <>
              <h3 className="mt-4 text-sm font-bold">Resumen que se abre en el chat</h3>
              <pre className="mt-2 whitespace-pre-wrap border border-ink/15 bg-paper-2 p-3 font-mono text-xs" data-testid="mensaje-resumen">{launch.text}</pre>
            </>
          )}
        </section>

        <section aria-labelledby="detalle-title" className="mt-6 border border-ink/25 bg-white/70 p-5">
          <h2 id="detalle-title" className="display text-2xl normal-case">Resumen guardado</h2>
          <ul className="mt-3 divide-y divide-ink/10 text-sm">
            {inquiry.lines.map((l) => (
              <li key={l.productId} className="flex justify-between gap-4 py-2">
                <span>{l.quantity} × {l.title}{l.packSize && !/pack de/i.test(l.title) ? ` (pack de ${l.packSize})` : ""} <span className="text-ink/60">{l.language === "na" ? "" : `[${languageLabel[l.language]}] · `}SKU {l.sku}</span>
                  {l.comboDiscountMinor > 0 && <span className="block text-xs font-semibold text-emerald">Combo caja + sobres: 10% OFF en {l.comboUnits} {l.comboUnits === 1 ? "sobre" : "sobres"} (−{formatARS(l.comboDiscountMinor)})</span>}
                  {l.transferDiscountMinor > 0 && <span className="block text-xs font-semibold text-emerald">Transferencia: −{formatARS(l.transferDiscountMinor)}</span>}
                </span>
                <span className="shrink-0 font-semibold">{l.lineSubtotalMinor === null ? "Por encargo · sin cotizar" : formatARS(l.lineSubtotalMinor)}{l.unitPriceUsdMinor ? <span className="block text-xs font-normal text-ink/60">{formatUSD(l.unitPriceUsdMinor)} c/u</span> : null}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-ink/15 pt-3 text-sm">
            {hasStock && <div className="flex justify-between"><dt>Subtotal de productos{hasEncargo ? " (sin los por encargo)" : ""}</dt><dd className="font-extrabold">{formatARS(inquiry.subtotalMinor)}</dd></div>}
            {inquiry.comboDiscountMinor > 0 && <div className="flex justify-between"><dt>Descuento combo caja + sobres</dt><dd className="font-semibold" data-testid="detalle-descuento-combo">−{formatARS(inquiry.comboDiscountMinor)}</dd></div>}
            {inquiry.discountMinor > 0 && <div className="flex justify-between"><dt>Descuento por transferencia</dt><dd className="font-semibold">−{formatARS(inquiry.discountMinor)}</dd></div>}
            {(inquiry.discountMinor > 0 || inquiry.comboDiscountMinor > 0) && <div className="flex justify-between"><dt>Productos con descuento</dt><dd className="font-extrabold">{formatARS(inquiry.subtotalMinor - inquiry.discountMinor - inquiry.comboDiscountMinor)}</dd></div>}
            <div className="flex justify-between"><dt>Envío</dt><dd className="font-semibold" data-testid="detalle-envio">{inquiry.delivery.method === "retiro" ? "No aplica: retiro" : "A coordinar"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Entrega</dt><dd className="text-right">{describeDelivery(inquiry.delivery)}</dd></div>
            <div className="flex justify-between"><dt>Preferencia de pago</dt><dd>{inquiry.paymentLabel}</dd></div>
            <div className="flex justify-between"><dt>Preparada el</dt><dd>{fmt(inquiry.createdAt)}</dd></div>
          </dl>
          {hasEncargo && <p className="mt-3 border-l-4 border-emerald bg-emerald/10 p-3 text-sm" data-testid="nota-encargo"><b>Por encargo:</b> sin precio ni cotización todavía. Si se confirman la disponibilidad y la cotización, la seña es del {encargo.senaPercent}% de lo cotizado y el saldo del {100 - encargo.senaPercent}%; pago y entrega se coordinan con la tienda. Consultar no reserva mercadería.</p>}
          {inquiry.fx && <p className="mt-3 text-xs text-ink/70" data-testid="fx-snapshot">Cotización usada: {inquiry.fx.mode === "manual" ? "valor fijado por la tienda" : "dólar blue (venta)"} {formatRate(inquiry.fx.rate10k)} por dólar, redondeado a múltiplos de $100. Queda guardada con esta consulta: si el dólar cambia, esta consulta no se modifica.</p>}
          <p className="mt-3 text-xs text-ink/60">Los precios son los vigentes al preparar la consulta. Estado: consulta preparada (no implica envío, pago ni reserva).</p>
        </section>

        <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="underline hover:text-emerald">{l.label}</Link>
          ))}
        </div>
      </div>
    </div>
  );
}

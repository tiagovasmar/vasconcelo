"use client";

import Link from "next/link";
import styles from "./wholesale-catalog.module.css";
import { useMemo, useRef, useState } from "react";
import { quote, type WholesaleRow, type WholesaleRules } from "@/features/mayorista/calc";
import { formatUSD } from "@/features/fx/convert";
import { languageLabel, kindLabel } from "@/content/labels";
import type { Language, ProductKind } from "@/content/schema";
import { formatARS } from "@/lib/format";
import { newKey } from "./admin-form";
import { SafeImage } from "./safe-image";

/**
 * Tabla de pedido mayorista: buscar, filtrar, elegir cantidades y revisar producto, foto, idioma/edición, presentación, cantidad, precio unitario según tramo y total.
 * Los totales que se ven acá son de ayuda: al enviar, el servidor vuelve a validar la cuenta, los tramos y los mínimos y calcula todos los importes.
 * Mayorista es siempre por pedido: no se muestra ni se descuenta stock minorista.
 */
export function WholesaleCatalog({ rows, rules, rate10k, defaultName }: { rows: WholesaleRow[]; rules: WholesaleRules; rate10k: number | null; defaultName: string }) {
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("");
  const [kind, setKind] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const key = useRef(newKey());

  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const shown = useMemo(() => rows.filter((r) => (!lang || r.language === lang) && (!kind || r.kind === kind) && (!q.trim() || norm(`${r.title} ${r.sku}`).includes(norm(q.trim())))), [rows, lang, kind, q]);
  const langs = [...new Set(rows.map((r) => r.language))];
  const kinds = [...new Set(rows.map((r) => r.kind))];

  const lines = rows.map((r) => ({ productId: r.productId, quantity: Math.max(0, Math.floor(Number(qty[r.productId] ?? 0)) || 0) })).filter((l) => l.quantity > 0);
  const quoted = useMemo(() => quote(rows, rules, lines, rate10k), [rows, rules, lines, rate10k]);
  const lineFor = (id: string) => quoted.lines.find((l) => l.productId === id);

  async function send() {
    if (busy) return;
    if (!lines.length) { setMsg({ ok: false, text: "Elegí al menos un producto." }); return; }
    if (!quoted.ok) { setMsg({ ok: false, text: quoted.problems[0] ?? "El pedido no cumple las condiciones." }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/mayoristas/pedido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines, contactName: name, contactPhone: phone || null, idempotencyKey: key.current }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data?.error?.message ?? "No pudimos enviar el pedido. Intentá de nuevo." }); return; }
      setSent(data.reference);
      key.current = newKey();
    } catch {
      setMsg({ ok: false, text: "No hay conexión. No se envió nada: tu pedido sigue armado, reintentá." });
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="border-l-4 border-emerald bg-emerald/10 p-5" data-testid="pedido-mayorista-enviado">
        <p className="text-xl font-extrabold">Recibimos tu pedido {sent}.</p>
        <p className="mt-2 text-sm">Todavía no es una compra: la tienda confirma disponibilidad e importe y recién entonces se paga la seña del 20%. Seguí cada etapa en <Link href={`/cuenta/consultas/${sent}`} className="font-semibold underline">tu seguimiento</Link>.</p>
      </div>
    );
  }

  const inp = "min-w-0 max-w-full min-h-11 rounded-md border border-ink/40 bg-white px-3 text-base";
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]" role="search" aria-label="Buscar en el catálogo mayorista">
        <div><label htmlFor="may-q" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Buscar</label><input id="may-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o SKU" className={`${inp} mt-1 w-full`} /></div>
        <div><label htmlFor="may-lang" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Idioma</label><select id="may-lang" value={lang} onChange={(e) => setLang(e.target.value)} className={`${inp} mt-1 w-full`}><option value="">Todos</option>{langs.map((l) => <option key={l} value={l}>{languageLabel[l as Language] ?? l}</option>)}</select></div>
        <div><label htmlFor="may-kind" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Presentación</label><select id="may-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={`${inp} mt-1 w-full`}><option value="">Todas</option>{kinds.map((k) => <option key={k} value={k}>{kindLabel[k as ProductKind] ?? k}</option>)}</select></div>
      </div>
      <p role="status" className="mt-3 text-sm text-ink/70">{shown.length} {shown.length === 1 ? "producto" : "productos"} · precios por tramo de cantidad{rules.combine === "pedido" ? " (las unidades de todo el pedido suman para el tramo)" : " (cada producto llega a su propio tramo)"}.</p>

      <div className="relative mt-3">
        <table className={`${styles.table} text-sm`} data-testid="tabla-mayorista">
          <caption className="sr-only">Pedido mayorista: producto, idioma, presentación, cantidad, precio unitario y total</caption>
          <thead><tr className="bg-paper-2 text-left text-xs uppercase tracking-wide"><th scope="col" className="p-2">Producto</th><th scope="col" className="p-2">Idioma / edición</th><th scope="col" className="p-2">Presentación</th><th scope="col" className="p-2">Tramos (desde)</th><th scope="col" className="p-2">Cantidad</th><th scope="col" className="p-2 text-right">Precio unitario</th><th scope="col" className="p-2 text-right">Total</th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const l = lineFor(r.productId);
              const id = `qty-${r.productId}`;
              return (
                <tr key={r.productId} className="border-t border-ink/10 align-top" data-testid="fila-mayorista">
                  <th scope="row" className="p-2 text-left font-semibold"><span className="flex min-w-0 items-center gap-2">{r.image && <SafeImage src={r.image.src} alt="" width={48} height={48} sizes="48px" className="h-12 w-12 shrink-0 object-contain" fallback={<span className="block h-12 w-12 bg-paper-2" aria-hidden="true" />} />}<span className="min-w-0 [overflow-wrap:anywhere]">{r.title}<span className="block text-xs font-normal text-ink/75">SKU {r.sku}</span></span></span></th>
                  <td className="p-2"><span className={styles.label}>Idioma / edición</span>{languageLabel[r.language as Language] ?? r.language}</td>
                  <td className="p-2"><span className={styles.label}>Presentación</span>{kindLabel[r.kind as ProductKind] ?? r.kind}</td>
                  <td className={`${styles.wide} p-2 text-xs`}><span className={styles.label}>Tramos (desde)</span>{r.tiers.length === 0 && <span>A cotizar</span>}{r.tiers.map((t) => <span key={t.minQty} className="block">{t.minQty}+ u.: {formatUSD(t.unitUsdMinor)}</span>)}</td>
                  <td className={`${styles.wide} relative p-2`}><span className={styles.label}>Cantidad</span><label htmlFor={id} className="sr-only">Cantidad de {r.title}</label><input id={id} inputMode="numeric" value={qty[r.productId] ?? ""} onChange={(e) => setQty((s) => ({ ...s, [r.productId]: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="0" disabled={!r.tiers.length} className={`${inp} w-24`} /></td>
                  <td className="p-2 text-right font-semibold"><span className={styles.label}>Precio unitario</span><span data-testid="precio-unitario">{!l ? (r.tiers.length ? "—" : "A cotizar") : l.status === "ok" ? <>{formatUSD(l.unitUsdMinor!)} <span className="text-xs font-normal">({formatARS(l.unitArsMinor!)})</span></> : <span title="Subí la cantidad hasta el primer tramo o consultanos">A cotizar{r.tiers[0] && l.unitUsdMinor === null ? ` · desde ${r.tiers[0].minQty} ${r.kind === "box" ? "cajas" : "unidades"}` : ""}</span>}</span></td>
                  <td className="p-2 text-right font-extrabold" data-testid="total-linea"><span className={styles.label}>Subtotal</span>{l && l.totalArsMinor !== null ? formatUSD(l.quantity * l.unitUsdMinor!) : "—"}</td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-ink/70">Ningún producto coincide con la búsqueda.</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="mt-6 min-w-0 border border-ink/25 bg-white/80 p-5 [overflow-wrap:anywhere]" aria-labelledby="resumen-mayorista" data-testid="resumen-mayorista">
        <h2 id="resumen-mayorista" className="display text-3xl normal-case">Tu pedido</h2>
        <p className="mt-2 text-sm"><b data-testid="unidades-total">{quoted.units}</b> unidades · {quoted.lines.some((line) => line.status === "a_cotizar") ? "subtotal de productos cotizados" : "total estimado"} <b data-testid="total-pedido">{formatUSD(quoted.lines.reduce((sum, line) => sum + (line.status === "ok" ? line.quantity * (line.unitUsdMinor ?? 0) : 0), 0))} <span className="text-xs font-normal">({formatARS(quoted.totalArsMinor)})</span></b></p>
        {rules.minBoxes != null && <p className="text-xs text-ink/70">Compra mínima de {rules.minBoxes} cajas.</p>}
        {rules.minUnits !== null && <p className="text-xs text-ink/70">Compra mínima: {rules.minUnits} unidades.</p>}
        {rules.minAmountMinor !== null && <p className="text-xs text-ink/70">Compra mínima: {formatARS(rules.minAmountMinor)}.</p>}
        {lines.length > 0 && quoted.problems.length > 0 && <div role="alert" data-testid="problemas-pedido"><ul className="mt-2 list-disc pl-5 text-sm font-semibold text-vermilion">{quoted.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink/75">
          <li>Es un pedido, no una compra: la tienda confirma disponibilidad e importe y después se paga la seña del 20%. El resto se paga al retirar o antes del despacho, con la mercadería ya en Argentina.</li>
          <li>Pago por transferencia o efectivo, sin descuento adicional ni cuotas sin interés. Podés consultar financiación a 3 o 6 meses: no se promete aprobación, cuotas ni tasas.</li>
          <li>Si el paquete se pierde o no se puede cumplir el pedido, se reintegra la seña.{rules.refundPeriod ? ` Plazo: ${rules.refundPeriod}` : ""}</li>
          {rules.cancellationPolicy && <li>Cancelación voluntaria: {rules.cancellationPolicy}</li>}
          {rules.delayText && <li>Demora estimada: {rules.delayText}. Se cuenta desde {rules.delayFrom}. No son fechas garantizadas.</li>}
        </ul>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="may-nombre" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Nombre y apellido</label><input id="may-nombre" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={`${inp} mt-1 w-full`} /></div>
          <div><label htmlFor="may-tel" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Teléfono (opcional)</label><input id="may-tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" className={`${inp} mt-1 w-full`} /></div>
        </div>
        <button type="button" onClick={send} disabled={busy} className="mt-4 max-w-full min-h-12 bg-ink px-6 font-bold text-paper hover:bg-emerald disabled:opacity-50" data-testid="enviar-pedido-mayorista">{busy ? "Enviando…" : "Enviar pedido mayorista"}</button>
        {msg && <p role="alert" className="mt-2 text-sm font-semibold text-vermilion">{msg.text}</p>}
      </section>
    </div>
  );
}

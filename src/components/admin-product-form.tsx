"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type AdminRow = {
  id: string;
  sku: string;
  title: string;
  expansion: string;
  kind: string;
  state: "pending" | "available" | "soldout" | "hidden";
  pricePesos: number | null;
  stock: number | null;
  maxPerOrder: number | null;
  visible: boolean;
  version: number;
  overridden: boolean;
  updatedLabel: string | null;
  base: { pricePesos: number | null; stock: number | null; maxPerOrder: number | null; visible: boolean };
  slug: string;
};

const stateInfo = {
  pending: { label: "Pendiente", cls: "bg-gold/30 text-ink ring-gold", help: "Falta confirmar precio o stock: se ve en la tienda como «a confirmar» y no se puede consultar con importe." },
  available: { label: "Disponible", cls: "bg-emerald text-paper ring-emerald", help: "Tiene precio y stock: se puede agregar al carrito." },
  soldout: { label: "Agotado", cls: "bg-vermilion text-white ring-vermilion", help: "Stock 0: se ve como agotado y no se puede agregar al carrito." },
  hidden: { label: "Oculto", cls: "bg-ink text-paper ring-ink", help: "No aparece en la tienda ni se puede consultar." },
} as const;

const field = "mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";
const label = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";

const fmt = (n: number | null) => (n === null ? "" : String(n));
const show = (n: number | null, unit = "") => (n === null ? "pendiente" : `${n.toLocaleString("es-AR")}${unit}`);

/** Convierte lo escrito en un número entero o null (vacío). Devuelve `undefined` si no es un entero válido. */
function parseInteger(raw: string): number | null | undefined {
  const t = raw.trim().replace(/[\s.$]/g, "");
  if (t === "") return null;
  return /^\d{1,12}$/.test(t) ? Number(t) : undefined;
}

export function AdminProductForm({ row }: { row: AdminRow }) {
  const router = useRouter();
  const [price, setPrice] = useState(fmt(row.pricePesos));
  const [stock, setStock] = useState(fmt(row.stock));
  const [max, setMax] = useState(fmt(row.maxPerOrder));
  const [visible, setVisible] = useState(row.visible);
  const [version, setVersion] = useState(row.version);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  // Cuando el servidor devuelve valores nuevos (tras guardar o restablecer), el formulario se alinea con ellos
  // (patrón de React: ajustar el estado durante el render al cambiar la «firma» de lo que llegó del servidor).
  const signature = [row.pricePesos, row.stock, row.maxPerOrder, row.visible, row.version].join("|");
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setPrice(fmt(row.pricePesos));
    setStock(fmt(row.stock));
    setMax(fmt(row.maxPerOrder));
    setVisible(row.visible);
    setVersion(row.version);
  }
  const info = stateInfo[row.state];
  const dirty = price !== fmt(row.pricePesos) || stock !== fmt(row.stock) || max !== fmt(row.maxPerOrder) || visible !== row.visible;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const p = parseInteger(price), s = parseInteger(stock), m = parseInteger(max);
    const local: Record<string, string> = {};
    if (p === undefined) local.pricePesos = "Escribí el precio en pesos, sin centavos (por ejemplo 12500), o dejalo vacío si está pendiente.";
    if (s === undefined) local.stock = "Escribí un número entero (0 si está agotado) o dejalo vacío si está pendiente.";
    if (m === undefined) local.maxPerOrder = "Escribí un número entero o dejalo vacío si no hay tope.";
    if (Object.keys(local).length) {
      setErrs(local);
      setMsg({ ok: false, text: "Revisá los campos marcados." });
      return;
    }
    setErrs({});
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricePesos: p, stock: s, maxPerOrder: m, visible, expectedVersion: version }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = (data?.error?.details ?? []) as Array<{ path: string; message: string }>;
        setErrs(Object.fromEntries(details.map((d) => [d.path, d.message])));
        setMsg({ ok: false, text: details.length ? "Revisá los campos marcados." : (data?.error?.message ?? "No se pudo guardar. Intentá de nuevo.") });
        return;
      }
      setVersion(data.version);
      setMsg({ ok: true, text: data.changed.length ? "Guardado. El cambio ya se ve en la tienda." : "No había cambios para guardar." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "No hay conexión con el servidor. No se guardó nada." });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm(`¿Volver ${row.title} a los valores del catálogo por código? Se pierden los valores cargados desde el panel (queda registrado en el historial).`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(row.id)}?version=${version}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data?.error?.message ?? "No se pudo restablecer." });
        return;
      }
      setMsg({ ok: true, text: "Restablecido a los valores del catálogo por código." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "No hay conexión con el servidor. No se cambió nada." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="rounded-xl border border-ink/15 bg-white p-4 sm:p-5" data-testid={`admin-fila-${row.id}`} data-state={row.state} aria-label={`Editar ${row.title}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight sm:text-lg">{row.title}</h2>
          <p className="mt-1 text-xs text-ink/70">{row.expansion} · <span className="font-mono">{row.sku}</span> · {row.kind}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${info.cls}`} data-testid="estado" title={info.help}>{info.label}</span>
      </div>
      <p className="mt-2 text-xs text-ink/70">{info.help}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <label htmlFor={`precio-${row.id}`} className={label}>Precio (ARS)</label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-ink/60" aria-hidden="true">$</span>
            <input id={`precio-${row.id}`} name="precio" inputMode="numeric" autoComplete="off" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="pendiente" aria-invalid={Boolean(errs.pricePesos)} aria-describedby={errs.pricePesos ? `e-precio-${row.id}` : undefined} className={`${field} pl-7`} /></div>
          {errs.pricePesos && <p id={`e-precio-${row.id}`} className="mt-1 text-xs font-medium text-vermilion">{errs.pricePesos}</p>}
        </div>
        <div>
          <label htmlFor={`stock-${row.id}`} className={label}>Stock</label>
          <input id={`stock-${row.id}`} name="stock" inputMode="numeric" autoComplete="off" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="pendiente" aria-invalid={Boolean(errs.stock)} aria-describedby={errs.stock ? `e-stock-${row.id}` : undefined} className={field} />
          {errs.stock && <p id={`e-stock-${row.id}`} className="mt-1 text-xs font-medium text-vermilion">{errs.stock}</p>}
        </div>
        <div>
          <label htmlFor={`max-${row.id}`} className={label}>Máx. por pedido</label>
          <input id={`max-${row.id}`} name="max" inputMode="numeric" autoComplete="off" value={max} onChange={(e) => setMax(e.target.value)} placeholder="sin tope" aria-invalid={Boolean(errs.maxPerOrder)} aria-describedby={errs.maxPerOrder ? `e-max-${row.id}` : undefined} className={field} />
          {errs.maxPerOrder && <p id={`e-max-${row.id}`} className="mt-1 text-xs font-medium text-vermilion">{errs.maxPerOrder}</p>}
        </div>
        <div className="flex items-end">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" name="visible" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="h-5 w-5 accent-emerald" /> Visible en la tienda</label>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink/65">Dejá precio o stock vacíos si todavía no los confirmaste: «pendiente» no es $0 ni agotado.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !dirty} className="min-h-11 rounded-lg bg-emerald px-5 text-sm font-semibold text-paper transition hover:bg-emerald-2 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Guardando…" : "Guardar cambios"}</button>
        {row.overridden && <button type="button" onClick={reset} disabled={busy} className="min-h-11 rounded-lg border border-ink/40 px-4 text-sm font-medium hover:bg-paper disabled:opacity-50">Restablecer al catálogo por código</button>}
        <a href={`/admin/historial?producto=${encodeURIComponent(row.id)}`} className="text-sm font-medium underline underline-offset-4">Historial</a>
        <a href={`/productos/${row.slug}`} className="text-sm underline underline-offset-4 text-ink/70">Ver ficha</a>
        <p role="status" aria-live="polite" className={`text-sm font-medium ${msg ? (msg.ok ? "text-emerald" : "text-vermilion") : ""}`} data-testid="mensaje">{msg?.text}</p>
      </div>
      <p className="mt-3 text-xs text-ink/60">
        {row.overridden ? `Valores del panel · último cambio ${row.updatedLabel}.` : "Valores del catálogo por código (sin cambios en el panel)."}
        {" "}Código: precio {show(row.base.pricePesos)}, stock {show(row.base.stock)}{row.base.visible ? "" : ", oculto"}.
      </p>
    </form>
  );
}

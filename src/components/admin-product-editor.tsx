"use client";

/* Miniaturas chicas (las subidas tienen una versión de 400 px): un <img> simple alcanza y evita pasar por el optimizador de imágenes. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatARS } from "@/lib/format";
import { formatUSD, parseUsdInput, usdInputText, usdToArsMinor } from "@/features/fx/convert";
import { stateInfo, type RowState } from "./admin-product-table";
import { useUnsavedGuard } from "./use-unsaved-guard";
import { AdminWholesalePrices } from "./admin-wholesale-prices";

export type GalleryItem = { src: string; thumb: string; alt: string; width: number; height: number; source?: "store" | "supplier" | "manufacturer" | "illustration"; origin?: string; upload: boolean; /** El archivo no existe en el servidor (ilustración de reserva): no se puede mostrar la miniatura. */ missing?: boolean };
export type LibraryItem = { src: string; thumb: string; alt: string; from: string };

export type EditorData = {
  id: string;
  sku: string;
  slug: string;
  kind: string;
  language: string;
  expansion: string;
  state: RowState;
  version: number;
  overridden: boolean;
  updatedLabel: string | null;
  codeTitle: string;
  codeDescription: string;
  title: string;
  description: string;
  usdMinor: number | null;
  arsMinor: number | null;
  /** Moneda del precio base: «ars» = precio fijo en pesos (accesorios, sin dólar). */
  priceBase: "usd" | "ars";
  /** Unidades por pack (accesorios): el stock se administra en PACKS. */
  packSize: number | null;
  stock: number | null;
  maxPerOrder: number | null;
  visible: boolean;
  orderOnly: boolean;
  draftNote: string | null;
  retired: boolean;
  legacyPriceMinor: number | null;
  rate10k: number | null;
  rateLabel: string;
  gallery: { items: GalleryItem[]; custom: boolean; version: number; codeItems: GalleryItem[] };
  library: LibraryItem[];
};

const field = "mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30 disabled:bg-paper disabled:text-ink/50";
const label = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";
const btn = "min-h-11 rounded-lg border border-ink/40 bg-white px-3 text-sm font-medium hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40";
const primary = "min-h-11 rounded-lg bg-emerald px-5 text-sm font-semibold text-paper transition hover:bg-emerald-2 disabled:cursor-not-allowed disabled:opacity-50";

type StockMode = "qty" | "unknown" | "order";
const modeOf = (d: Pick<EditorData, "stock" | "orderOnly">): StockMode => (d.orderOnly ? "order" : d.stock === null ? "unknown" : "qty");
const sig = (items: GalleryItem[]) => JSON.stringify(items.map((i) => [i.src, i.alt]));

export function AdminProductEditor({ data }: { data: EditorData }) {
  const router = useRouter();
  const locked = data.retired;

  /* ------------------------------------------------------------ datos de la ficha ------------------------------------------------------------ */
  const [title, setTitle] = useState(data.title);
  const [description, setDescription] = useState(data.description);
  const [usd, setUsd] = useState(usdInputText(data.usdMinor));
  const isArs = data.priceBase === "ars";
  const arsText = (m: number | null) => (m === null ? "" : String(m / 100));
  const [ars, setArs] = useState(arsText(data.arsMinor));
  const [mode, setMode] = useState<StockMode>(modeOf(data));
  const [stock, setStock] = useState(data.stock === null ? "" : String(data.stock));
  const [max, setMax] = useState(data.maxPerOrder === null ? "" : String(data.maxPerOrder));
  const [visible, setVisible] = useState(data.visible);
  const [ack, setAck] = useState(false);
  const [version, setVersion] = useState(data.version);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  // Cuando el servidor devuelve valores nuevos (tras guardar y refrescar), el formulario se alinea con ellos.
  const signature = [data.title, data.description, data.usdMinor, data.arsMinor, data.stock, data.maxPerOrder, data.visible, data.orderOnly, data.version].join("|");
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setTitle(data.title);
    setDescription(data.description);
    setUsd(usdInputText(data.usdMinor));
    setArs(arsText(data.arsMinor));
    setMode(modeOf(data));
    setStock(data.stock === null ? "" : String(data.stock));
    setMax(data.maxPerOrder === null ? "" : String(data.maxPerOrder));
    setVisible(data.visible);
    setVersion(data.version);
    setAck(false);
  }

  const parsedUsd = isArs || usd.trim() === "" ? null : parseUsdInput(usd);
  const usdInvalid = !isArs && usd.trim() !== "" && parsedUsd === null;
  const arsPesos = isArs && /^\d{1,8}$/.test(ars.trim()) && Number(ars.trim()) >= 1 ? Number(ars.trim()) : null;
  const arsInvalid = isArs && arsPesos === null;
  const live = parsedUsd !== null && data.rate10k ? usdToArsMinor(parsedUsd, data.rate10k) : null;
  const dataDirty =
    title.trim() !== data.title || description.trim() !== data.description || usd.trim() !== usdInputText(data.usdMinor).trim() || ars.trim() !== arsText(data.arsMinor).trim() ||
    mode !== modeOf(data) || (mode === "qty" && stock.trim() !== (data.stock === null ? "" : String(data.stock))) ||
    max.trim() !== (data.maxPerOrder === null ? "" : String(data.maxPerOrder)) || visible !== data.visible;

  /* ----------------------------------------------------------------- fotos ----------------------------------------------------------------- */
  const [items, setItems] = useState<GalleryItem[]>(data.gallery.items);
  const [gVersion, setGVersion] = useState(data.gallery.version);
  const [gSaving, setGBusy] = useState(false);
  const [gRefreshing, refreshGallery] = useTransition();
  const gBusy = gSaving || gRefreshing;
  const [gMsg, setGMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const gSignature = sig(data.gallery.items) + data.gallery.version;
  const [gSeen, setGSeen] = useState(gSignature);
  if (gSeen !== gSignature) {
    setGSeen(gSignature);
    setItems(data.gallery.items);
    setGVersion(data.gallery.version);
  }
  const galleryDirty = sig(items) !== sig(data.gallery.items);
  const [uploadSource, setUploadSource] = useState<"store" | "supplier" | "manufacturer">("store");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [libQ, setLibQ] = useState("");

  useUnsavedGuard(dataDirty || galleryDirty);

  const lib = useMemo(() => {
    const have = new Set(items.map((i) => i.src));
    const terms = libQ.toLowerCase().split(/\s+/).filter(Boolean);
    return data.library.filter((l) => !have.has(l.src) && terms.every((t) => `${l.from} ${l.alt}`.toLowerCase().includes(t))).slice(0, 48);
  }, [data.library, items, libQ]);

  useEffect(() => {
    if (!msg?.ok) return;
    const t = setTimeout(() => setMsg((m) => (m?.ok ? null : m)), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const local: Record<string, string> = {};
    if (usdInvalid) local.priceUsdMinor = "Escribí el precio en dólares, por ejemplo 10 o 10,50, o dejalo vacío si está pendiente.";
    if (arsInvalid) local.priceArsMinor = "Escribí el precio fijo en pesos enteros, por ejemplo 1000.";
    let stockValue: number | null = null;
    if (mode === "qty") {
      const t = stock.trim().replace(/[\s.]/g, "");
      if (t === "") local.stock = "Escribí la cantidad (0 si está agotado) o elegí «cantidad desconocida».";
      else if (!/^\d{1,7}$/.test(t)) local.stock = "El stock debe ser un número entero.";
      else stockValue = Number(t);
    } else if (mode === "order") stockValue = 0;
    const maxT = max.trim();
    if (maxT !== "" && !/^\d{1,2}$/.test(maxT)) local.maxPerOrder = "El máximo por pedido es un entero entre 1 y 99, o vacío si no hay tope.";
    if (title.trim().length < 3) local.title = "El título debe tener al menos 3 caracteres.";
    if (description.trim().length < 10) local.description = "La descripción debe tener al menos 10 caracteres.";
    if (Object.keys(local).length) {
      setErrs(local);
      setMsg({ ok: false, text: "Revisá los campos marcados." });
      return;
    }
    setErrs({});
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(data.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isArs ? { priceArsMinor: (arsPesos as number) * 100 } : { priceUsdMinor: parsedUsd }), stock: mode === "unknown" ? null : stockValue, maxPerOrder: maxT === "" ? null : Number(maxT), visible, orderOnly: mode === "order",
          title: title.trim(), description: description.trim(), acknowledgeDraft: ack, expectedVersion: version,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = (body?.error?.details ?? []) as Array<{ path: string; message: string }>;
        setErrs(Object.fromEntries(details.map((d) => [d.path === "stock" ? "stock" : d.path, d.message])));
        setMsg({ ok: false, text: details.length ? "Revisá los campos marcados." : (body?.error?.message ?? "No se pudo guardar. Intentá de nuevo.") });
        return;
      }
      setVersion(body.version);
      setMsg({ ok: true, text: body.changed.length ? "Guardado. El cambio ya se ve en la tienda." : "No había cambios para guardar." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "No hay conexión con el servidor. No se guardó nada." });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("¿Volver precio, stock, título y descripción a los valores del catálogo por código? Lo cargado desde el panel se pierde (queda en el historial). Las fotos se restablecen aparte.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(data.id)}?version=${version}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error?.message ?? "No se pudo restablecer." });
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

  /* ----------------------------------------------------------------- acciones de fotos ----------------------------------------------------------------- */
  const move = (i: number, to: number) => setItems((cur) => {
    if (to < 0 || to >= cur.length) return cur;
    const next = [...cur];
    const [it] = next.splice(i, 1);
    next.splice(to, 0, it);
    return next;
  });
  const setAlt = (i: number, alt: string) => setItems((cur) => cur.map((x, k) => (k === i ? { ...x, alt } : x)));
  const remove = (i: number) => setItems((cur) => cur.filter((_, k) => k !== i));

  /**
   * Sube una o VARIAS fotos, de a una y en el orden elegido (el servidor valida y optimiza cada una). Las aceptadas se suman al final de la galería
   * (máximo 12) sin guardar todavía: después se ordenan, se elige la portada y se pulsa «Guardar fotos». Las rechazadas se informan una por una.
   */
  async function uploadMany(files: File[]) {
    setGMsg(null);
    if (files.length === 0) return;
    setUploading(true);
    const added: GalleryItem[] = [];
    const problems: string[] = [];
    let known = new Set(items.map((x) => x.src));
    let room = 12 - items.length;
    try {
      for (const [i, file] of files.entries()) {
        setProgress(`Subiendo ${i + 1} de ${files.length}: ${file.name}`);
        if (room <= 0) {
          problems.push(`${file.name}: la galería ya tiene 12 fotos (el máximo).`);
          continue;
        }
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/admin/media", { method: "POST", body: fd });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            problems.push(`${file.name}: ${body?.error?.message ?? "no se pudo subir."}`);
            continue;
          }
          const im = body.image as { src: string; thumbSrc: string; width: number; height: number; duplicate: boolean };
          if (known.has(im.src)) {
            problems.push(`${file.name}: esa foto ya está en la galería.`);
            continue;
          }
          known = new Set([...known, im.src]);
          room--;
          added.push({ src: im.src, thumb: im.thumbSrc, alt: `${data.title}: foto`, width: im.width, height: im.height, source: uploadSource, upload: true, origin: "Subida desde el panel" });
        } catch {
          problems.push(`${file.name}: no hay conexión con el servidor.`);
        }
      }
      if (added.length) setItems((cur) => [...cur, ...added.filter((a) => !cur.some((c) => c.src === a.src))].slice(0, 12));
      const okText = added.length ? `${added.length} ${added.length === 1 ? "foto subida" : "fotos subidas"} al final de la galería. Ordenalas, elegí la portada, ajustá los textos alternativos y guardá.` : "";
      setGMsg({ ok: added.length > 0 && problems.length === 0, text: [okText, problems.length ? `No se subieron ${problems.length}: ${problems.join(" · ")}` : ""].filter(Boolean).join(" ") });
    } finally {
      setUploading(false);
      setProgress("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveGallery() {
    setGMsg(null);
    if (items.some((i) => i.alt.trim().length < 3)) {
      setGMsg({ ok: false, text: "Cada foto necesita un texto alternativo de al menos 3 caracteres." });
      return;
    }
    setGBusy(true);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(data.id)}/gallery`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map((i) => ({ src: i.src, alt: i.alt.trim(), ...(i.upload && i.source ? { source: i.source } : {}) })), expectedVersion: gVersion }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGMsg({ ok: false, text: body?.error?.message ?? "No se pudo guardar la galería." });
        return;
      }
      setGVersion(body.version);
      setGMsg({ ok: true, text: items.length ? "Galería guardada. La portada y el orden ya se ven en la tienda." : "Galería guardada. La ficha queda sin fotos." });
      refreshGallery(() => router.refresh());
    } catch {
      setGMsg({ ok: false, text: "No hay conexión con el servidor. No se guardó nada." });
    } finally {
      setGBusy(false);
    }
  }

  async function resetGallery() {
    if (!window.confirm("¿Volver a las fotos del catálogo por código? Se pierde el orden y los textos que elegiste (queda en el historial).")) return;
    setGBusy(true);
    setGMsg(null);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(data.id)}/gallery?version=${gVersion}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGMsg({ ok: false, text: body?.error?.message ?? "No se pudo restablecer." });
        return;
      }
      setGMsg({ ok: true, text: "Galería restablecida a la del catálogo por código." });
      refreshGallery(() => router.refresh());
    } catch {
      setGMsg({ ok: false, text: "No hay conexión con el servidor." });
    } finally {
      setGBusy(false);
    }
  }

  const info = stateInfo[data.state];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink/70"><Link href="/admin/productos" className="underline underline-offset-4">← Volver a la lista</Link></p>
          <h1 className="mt-2 text-xl font-semibold leading-tight sm:text-2xl" data-testid="editor-titulo">{data.codeTitle}</h1>
          <p className="mt-1 text-xs text-ink/70">{data.expansion} · {data.language} · {data.kind} · <span className="font-mono">{data.sku}</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!locked && <a href="#h-fotos" className={btn + " inline-flex items-center"}>Editar fotos</a>}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${info.cls}`} data-testid="estado" title={info.help}>{info.label}</span>
          <a href={`/productos/${data.slug}?preview=1`} target="_blank" rel="noopener" className={btn + " inline-flex items-center"} data-testid="vista-previa">Previsualizar ficha pública ↗</a>
        </div>
      </div>

      {data.retired && <p className="rounded-lg border border-ink/30 bg-paper-2 p-4 text-sm" data-testid="aviso-retirado"><b>Producto retirado por código.</b> No se puede editar ni volver a mostrar desde el panel.</p>}
      {data.draftNote && (
        <p className="rounded-lg border border-gold bg-gold/20 p-4 text-sm" data-testid="aviso-borrador"><b>Ficha en borrador:</b> {data.draftNote}</p>
      )}

      <form onSubmit={save} noValidate className="space-y-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-6" aria-label="Datos de la ficha" data-testid="editor-datos">
        <section aria-labelledby="h-datos" className="space-y-4">
          <h2 id="h-datos" className="text-lg font-semibold">Datos de la ficha</h2>
          <div>
            <label htmlFor="ed-title" className={label}>Título</label>
            <input id="ed-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} maxLength={160} className={field} aria-invalid={Boolean(errs.title)} />
            {errs.title && <p className="mt-1 text-xs font-medium text-vermilion">{errs.title}</p>}
            {title.trim() !== data.codeTitle && <p className="mt-1 text-xs text-ink/65">Título del catálogo: «{data.codeTitle}». <button type="button" className="underline" onClick={() => setTitle(data.codeTitle)}>Usar ese</button></p>}
          </div>
          <div>
            <label htmlFor="ed-desc" className={label}>Descripción breve</label>
            <textarea id="ed-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={locked} rows={5} maxLength={1500} className={field + " py-2"} aria-invalid={Boolean(errs.description)} />
            {errs.description && <p className="mt-1 text-xs font-medium text-vermilion">{errs.description}</p>}
            <p className="mt-1 text-xs text-ink/65">Idioma, formato, colección, fuentes, contenido y garantías verificables no se editan acá: siguen viniendo del catálogo.{description.trim() !== data.codeDescription && <> <button type="button" className="underline" onClick={() => setDescription(data.codeDescription)}>Usar la descripción del catálogo</button></>}</p>
          </div>
        </section>

        <section aria-labelledby="h-precio" className="space-y-4 border-t border-ink/10 pt-5">
          <h2 id="h-precio" className="text-lg font-semibold">Precio y disponibilidad</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {isArs ? (
              <div>
                <label htmlFor="ed-ars" className={label}>Precio fijo (ARS)</label>
                <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-ink/60" aria-hidden="true">$</span>
                  <input id="ed-ars" name="ars" inputMode="numeric" autoComplete="off" value={ars} onChange={(e) => setArs(e.target.value.replace(/\D/g, "").slice(0, 8))} disabled={locked} placeholder="en pesos" className={field + " pl-8"} aria-invalid={Boolean(errs.priceArsMinor) || arsInvalid} aria-describedby="ed-ars-ayuda" data-testid="editor-ars" />
                </div>
                {errs.priceArsMinor && <p className="mt-1 text-xs font-medium text-vermilion">{errs.priceArsMinor}</p>}
                <p id="ed-ars-ayuda" className="mt-1 text-xs text-ink/65" data-testid="ars-previa" aria-live="polite">Precio FIJO en pesos por pack de {data.packSize} unidades: no cambia con el dólar ni con la cotización y no tiene valor en USD. {arsPesos !== null ? <>En la tienda se verá <b>{formatARS(arsPesos * 100)}</b>.</> : "Escribí un número entero de pesos."}</p>
              </div>
            ) : (
            <div>
              <label htmlFor="ed-usd" className={label}>Precio base (USD)</label>
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-ink/60" aria-hidden="true">USD</span>
                <input id="ed-usd" name="usd" inputMode="decimal" autoComplete="off" value={usd} onChange={(e) => setUsd(e.target.value)} disabled={locked} placeholder="pendiente" className={field + " pl-12"} aria-invalid={Boolean(errs.priceUsdMinor) || usdInvalid} aria-describedby="ed-usd-ayuda" />
              </div>
              {errs.priceUsdMinor && <p className="mt-1 text-xs font-medium text-vermilion">{errs.priceUsdMinor}</p>}
              <p id="ed-usd-ayuda" className="mt-1 text-xs text-ink/65" data-testid="ars-previa" aria-live="polite">
                {usdInvalid ? "Valor no válido." : parsedUsd === null ? "Vacío = precio pendiente (no es USD 0)." : live !== null ? <>En la tienda se verá <b>{formatARS(live)}</b> ({formatUSD(parsedUsd)} × cotización vigente, redondeado a múltiplos de $100).</> : "No hay una cotización utilizable: el valor en pesos quedaría pendiente."}
              </p>
              <p className="mt-1 text-xs text-ink/65">{data.rateLabel}</p>
              {data.legacyPriceMinor !== null && <p className="mt-1 text-xs text-ink/65" data-testid="precio-anterior">Precio anterior en pesos cargado a mano: {formatARS(data.legacyPriceMinor)}. No rige ni se convierte; es solo un dato anterior.</p>}
            </div>
            )}
            <div>
              <label htmlFor="ed-max" className={label}>Máximo por pedido</label>
              <input id="ed-max" name="max" inputMode="numeric" autoComplete="off" value={max} onChange={(e) => setMax(e.target.value)} disabled={locked} placeholder="sin tope" className={field} aria-invalid={Boolean(errs.maxPerOrder)} />
              {errs.maxPerOrder && <p className="mt-1 text-xs font-medium text-vermilion">{errs.maxPerOrder}</p>}
            </div>
          </div>

          <fieldset className="space-y-2" disabled={locked}>
            {data.packSize ? <p className="text-xs text-ink/70" data-testid="ayuda-packs">1 pack = 5 protectores. Si tenés 100 protectores, cargá 20 packs.</p> : null}
            <legend className={label}>{data.packSize ? `Stock disponible — packs de ${data.packSize}` : "Stock (unidades del artículo que se vende)"}</legend>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === "qty"} onChange={() => setMode("qty")} className="h-5 w-5 accent-emerald" /> {data.packSize ? "Packs en stock" : "Cantidad en stock"}</label>
              <input aria-label={data.packSize ? `Stock disponible — packs de ${data.packSize}` : "Cantidad en stock"} name="stock" inputMode="numeric" autoComplete="off" value={mode === "qty" ? stock : ""} onChange={(e) => setStock(e.target.value)} disabled={mode !== "qty"} placeholder="0 = sin stock" className={field + " !mt-0 max-w-40"} aria-invalid={Boolean(errs.stock)} />
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === "unknown"} onChange={() => setMode("unknown")} className="h-5 w-5 accent-emerald" /> Cantidad desconocida (pendiente)</label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === "order"} onChange={() => setMode("order")} className="h-5 w-5 accent-emerald" /> Disponible por encargo</label>
            </div>
            {errs.stock && <p className="text-xs font-medium text-vermilion">{errs.stock}</p>}
            <p className="text-xs text-ink/65">Cero es <b>sin stock</b>; «desconocida» es <b>pendiente</b> (no es cero); «por encargo» no se vende de stock: se consulta y se cotiza con la tienda. Un artículo retirado se define por código.</p>
          </fieldset>

          <div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} disabled={locked} className="h-5 w-5 accent-emerald" /> Publicada (visible en la tienda)</label>
            {data.draftNote && visible && !data.visible && (
              <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-md bg-gold/20 p-3 text-sm"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-5 w-5 accent-emerald" /> <span>Confirmo que ya resolví el dato pendiente de esta ficha: <i>{data.draftNote}</i></span></label>
            )}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
          <button type="submit" disabled={busy || !dataDirty || locked} className={primary} data-testid="guardar-ficha">{busy ? "Guardando…" : "Guardar cambios"}</button>
          {data.overridden && !locked && <button type="button" onClick={reset} disabled={busy} className={btn}>Restablecer al catálogo por código</button>}
          <a href={`/admin/historial?producto=${encodeURIComponent(data.id)}`} className="text-sm font-medium underline underline-offset-4">Historial</a>
          {dataDirty && <span className="text-xs font-semibold text-ink/70" data-testid="sin-guardar">Cambios sin guardar</span>}
          <p role="status" aria-live="polite" className={`text-sm font-medium ${msg ? (msg.ok ? "text-emerald" : "text-vermilion") : ""}`} data-testid="mensaje">{msg?.text}</p>
        </div>
        <p className="text-xs text-ink/60">{data.overridden ? `Valores del panel · último cambio ${data.updatedLabel}.` : "Valores del catálogo por código (sin cambios en el panel)."}</p>
      </form>
      {!data.retired && <AdminWholesalePrices productId={data.id} title={data.title} />}

      <section aria-labelledby="h-fotos" className="space-y-4 rounded-xl border border-ink/15 bg-white p-4 sm:p-6" data-testid="editor-fotos">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="h-fotos" className="text-lg font-semibold">Fotos</h2>
            <p className="mt-1 max-w-2xl text-xs text-ink/65">La primera foto es la <b>portada</b> (la que se ve en tarjetas y listas). Las fotos de proveedor son referencias; subí acá las de tu stock real cuando las tengas. Si quitás una foto, queda disponible en la biblioteca.</p>
          </div>
          <p className="text-xs text-ink/65">{data.gallery.custom ? "Galería elegida en el panel" : "Galería del catálogo por código"}</p>
        </div>

        {items.length === 0 && <p className="rounded-lg bg-paper-2 p-3 text-sm">{galleryDirty ? "La ficha quedará sin fotos cuando guardes." : "La ficha no tiene fotos."} Podés subir otras o restaurar las originales.</p>}
        <fieldset aria-label="Editar galería" className="min-w-0 space-y-4" disabled={gBusy || locked}>
          <ol className="space-y-3" data-testid="galeria-lista">
            {items.map((im, i) => (
              <li key={im.src} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-lg border border-ink/15 p-3 sm:grid-cols-[112px_minmax(0,1fr)_auto]" data-testid={`foto-${i}`}>
                <div className="relative flex h-24 w-[88px] items-center justify-center overflow-hidden rounded-md bg-paper-2 sm:h-28 sm:w-28">
                  {im.missing ? <span className="px-1 text-center text-[.65rem] text-ink/80">archivo no disponible</span> : <img src={im.thumb} alt="" className="h-full w-full object-contain" loading="lazy" />}
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-emerald px-1.5 py-0.5 text-[.6rem] font-bold uppercase text-paper" data-testid="portada">Portada</span>}
                </div>
                <div className="min-w-0">
                  <label htmlFor={`alt-${i}`} className={label}>Texto alternativo</label>
                  <textarea id={`alt-${i}`} value={im.alt} onChange={(e) => setAlt(i, e.target.value)} rows={2} maxLength={250} className={field + " py-2 text-sm"} />
                  <p className="mt-1 text-xs text-ink/60">{im.width}×{im.height}px{im.upload ? ` · subida desde el panel (${im.source === "store" ? "mi stock real" : im.source === "supplier" ? "referencia de proveedor" : "referencia del fabricante"})` : im.source === "supplier" ? " · foto de proveedor (referencia)" : im.source === "illustration" ? " · imagen ilustrativa generada: NO es una foto del stock real" : ""}</p>
                </div>
                <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:flex-col">
                  <button type="button" className={btn} onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Subir la foto ${i + 1}`}>↑ Subir</button>
                  <button type="button" className={btn} onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label={`Bajar la foto ${i + 1}`}>↓ Bajar</button>
                  {i > 0 && <button type="button" className={btn} onClick={() => move(i, 0)} data-testid="hacer-portada">Hacer portada</button>}
                  <button type="button" className={btn + " text-vermilion"} onClick={() => remove(i)} aria-label={`Quitar la foto ${i + 1}`}>Quitar</button>
                </div>
              </li>
            ))}
          </ol>

          <div className="grid gap-4 border-t border-ink/10 pt-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">Subir fotos (una o varias)</h3>
              <p className="mt-1 text-xs text-ink/65">JPG, PNG o WebP de hasta 8 MB y al menos 300 px de lado. Se revisa el contenido real y se optimiza: nunca se sirve el original.</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="up-source" className={label}>Quién sacó la foto</label>
                  <select id="up-source" value={uploadSource} onChange={(e) => setUploadSource(e.target.value as typeof uploadSource)} className={field + " !mt-1"}>
                    <option value="store">Yo: mi stock real</option>
                    <option value="supplier">Proveedor (referencia)</option>
                    <option value="manufacturer">Fabricante (referencia)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="up-file" className={label}>Archivos</label>
                  <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!uploading && !gBusy && !locked) void uploadMany([...e.dataTransfer.files]); }} className={`mt-1 rounded-lg border border-dashed p-2 ${dragOver ? "border-emerald bg-emerald/5" : "border-ink/40"}`} data-testid="zona-fotos">
                    <input ref={fileRef} id="up-file" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading || locked} onChange={(e) => void uploadMany([...(e.target.files ?? [])])} className="block min-h-11 text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-ink/40 file:bg-white file:px-3" data-testid="subir-foto" />
                    <p className="mt-1 text-xs text-ink/60">También podés arrastrar las fotos hasta acá. Se suben en el orden elegido.</p>
                  </div>
                </div>
              </div>
              {uploading && <p className="mt-2 text-sm" role="status" data-testid="progreso-subida">{progress || "Subiendo y optimizando…"}</p>}
            </div>
            <details className="rounded-lg border border-ink/15 p-3" data-testid="biblioteca">
              <summary className="cursor-pointer text-sm font-semibold">Elegir de la biblioteca ({data.library.length} fotos del catálogo y subidas)</summary>
              <label htmlFor="lib-q" className={label + " mt-3"}>Buscar</label>
              <input id="lib-q" value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Nombre del producto…" className={field} />
              <ul className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                {lib.map((l) => (
                  <li key={l.src}>
                    <button type="button" onClick={() => setItems((cur) => (cur.length >= 12 ? cur : [...cur, { src: l.src, thumb: l.thumb, alt: l.alt || data.title, width: 0, height: 0, upload: l.src.startsWith("/images/uploads/") }]))} className="flex h-full w-full flex-col items-center rounded-md border border-ink/15 p-1 text-center hover:border-emerald" title={l.from}>
                      <img src={l.thumb} alt="" className="h-16 w-full object-contain" loading="lazy" />
                      <span className="mt-1 line-clamp-2 text-[.6rem] leading-tight text-ink/70">{l.from}</span>
                    </button>
                  </li>
                ))}
                {lib.length === 0 && <li className="col-span-full text-xs text-ink/60">No hay fotos que coincidan.</li>}
              </ul>
            </details>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
            <button type="button" onClick={saveGallery} disabled={uploading || !galleryDirty} className={primary} data-testid="guardar-galeria">{gBusy ? "Guardando…" : "Guardar fotos"}</button>
            {data.gallery.custom && !locked && <button type="button" onClick={resetGallery} disabled={uploading} className={btn}>Volver a las fotos del catálogo</button>}
            {galleryDirty && <span className="text-xs font-semibold text-ink/70">Fotos sin guardar</span>}
            <p role="status" aria-live="polite" className={`text-sm font-medium ${gMsg ? (gMsg.ok ? "text-emerald" : "text-vermilion") : ""}`} data-testid="mensaje-fotos">{gMsg?.text}</p>
          </div>
        </fieldset>
      </section>
    </div>
  );
}

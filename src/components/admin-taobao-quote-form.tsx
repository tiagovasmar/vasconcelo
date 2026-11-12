"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { newKey } from "@/components/admin-form";
import type { TaobaoQuote } from "@/features/admin/taobao-quotes";
import { MAX_QUOTE_PHOTO_EDGE, MAX_QUOTE_PHOTO_URL, MAX_QUOTE_RATE, MAX_QUOTE_VARIANTS, MIN_QUOTE_RATE, quoteAmount, quoteDecimal, usdFromRmb } from "@/lib/taobao-quote";

const field = "mt-1 block min-h-11 w-full min-w-0 rounded-md border border-ink/40 bg-white px-3 text-base";
const button = "inline-flex min-h-11 items-center rounded-md border border-ink/30 px-3 text-sm font-semibold disabled:opacity-50";
const photos = ["image/jpeg", "image/png", "image/webp"];
type Variant = { key: string; name: string; rmb: string; logistics: string; photo: string | null };
const emptyVariant: Variant = { key: "initial", name: "", rmb: "", logistics: "", photo: null };

async function makeThumbnail(file: File) {
  if (!photos.includes(file.type) || file.size > 10_000_000) throw new Error("Elegí un JPG, PNG o WebP de hasta 10 MB.");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_QUOTE_PHOTO_EDGE / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no pudo preparar la foto.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5, 0.3]) {
      const data = canvas.toDataURL("image/webp", quality);
      if (data.startsWith("data:image/webp;base64,") && data.length <= MAX_QUOTE_PHOTO_URL) return data;
    }
    throw new Error("No pudimos reducir la foto. Probá con una imagen más chica.");
  } finally {
    image.close();
  }
}

export function AdminTaobaoQuoteForm({ supplierId, quote }: { supplierId: string; quote?: TaobaoQuote }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [rate, setRate] = useState(quote ? String(quote.rate / 10_000) : "");
  const [rateDate, setRateDate] = useState(quote?.rateDate ?? null);
  const [variants, setVariants] = useState<Variant[]>(() => quote?.variants.map((row, i) => ({
    key: String(i), name: row.name, rmb: String(row.rmb / 100), logistics: row.logisticsUsd === null ? "" : String(row.logisticsUsd / 100), photo: row.photo,
  })) ?? [emptyVariant]);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingRate, setLoadingRate] = useState(false);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [error, setError] = useState("");
  const path = `/admin/proveedores/${supplierId}`;
  const parsedRate = quoteDecimal(rate, 4);
  const validRate = parsedRate !== null && parsedRate >= MIN_QUOTE_RATE && parsedRate <= MAX_QUOTE_RATE ? parsedRate : null;

  function update(row: Variant, patch: Partial<Variant>) {
    setVariants((current) => current.map((item) => item.key === row.key ? { ...item, ...patch } : item));
  }

  function addVariant() {
    const next = { ...emptyVariant, key: newKey() };
    setVariants((all) => [...all, next]);
  }

  function importList() {
    const lines = paste.split(/\r?\n/).filter((line) => line.trim());
    const rows = lines.map((line) => {
      const match = line.match(/^\s*(.+?)\s*(?:\||\t)\s*(?:[¥￥]\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:RMB|CNY|元)?\s*$/i);
      if (!match || match[1].length > 120 || !quoteDecimal(match[2], 2)) return null;
      return { ...emptyVariant, key: newKey(), name: match[1].trim(), rmb: match[2] };
    });
    const first = variants[0];
    const base = variants.length === 1 && !first.name && !first.rmb && !first.logistics && !first.photo ? [] : variants;
    if (!rows.length || base.length + rows.length > MAX_QUOTE_VARIANTS || rows.some((row) => row === null)) {
      setError(`Usá «Variante | precio RMB» en cada línea. Podés guardar hasta ${MAX_QUOTE_VARIANTS} variantes por enlace.`);
      return;
    }
    setVariants([...base, ...rows.filter((row) => row !== null)]);
    setPaste("");
    setError("");
  }

  async function loadRate() {
    setError("");
    setLoadingRate(true);
    try {
      const res = await fetch("/api/admin/proveedores/cotizacion-rmb", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "No se pudo consultar la cotización.");
      setRate(String(data.rate / 10_000));
      setRateDate(data.date);
    } catch (e) {
      setError(e instanceof Error && !(e instanceof TypeError) ? e.message : "No se pudo consultar la cotización. Ingresala a mano.");
    } finally {
      setLoadingRate(false);
    }
  }

  async function loadPhoto(row: Variant, file: File) {
    setLoadingPhoto(true);
    setError("");
    try {
      update(row, { photo: await makeThumbnail(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la foto.");
    } finally {
      setLoadingPhoto(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || loadingPhoto || loadingRate) return;
    const form = new FormData(e.currentTarget);
    const rows = variants.map(({ name, rmb, logistics, photo }) => ({
      name, rmb: quoteDecimal(rmb, 2), logisticsUsd: logistics.trim() ? quoteDecimal(logistics, 2) : null, photo,
    }));
    if (validRate === null || rows.some((row, i) => !row.rmb || (variants[i].logistics.trim() && row.logisticsUsd === null))) {
      setError("Ingresá una cotización válida, un precio positivo en RMB por variante y un importe válido para el envío y la aduana si los cargás.");
      return;
    }
    key.current ??= newKey();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/proveedores/cotizaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, id: quote?.id ?? key.current, version: quote?.version, url: form.get("url"), title: form.get("title"), note: form.get("note"), rate: validRate, rateDate, variants: rows }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "No se pudo guardar la cotización.");
      }
      router.replace(path);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && !(e instanceof TypeError) ? e.message : "No hay conexión. Podés reintentar sin volver a cargar los datos.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-semibold">Nombre de la publicación
            <input name="title" required minLength={2} maxLength={120} defaultValue={quote?.title} className={field} />
          </label>
          <label className="min-w-0 text-sm font-semibold">Enlace de Taobao o Tmall
            <input name="url" type="url" required maxLength={2048} defaultValue={quote?.url} className={field} />
          </label>
        </div>
        <label className="block text-sm font-semibold">Notas de esta publicación
          <textarea name="note" rows={3} maxLength={2000} defaultValue={quote?.note} className={field} placeholder="Sellado, precio negociado, condiciones o lo que te confirmó el vendedor." />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 text-sm font-semibold">RMB por 1 USD
            <input inputMode="decimal" required maxLength={8} value={rate} disabled={loadingRate} onChange={(e) => { setRate(e.target.value); setRateDate(null); }} className={field} />
          </label>
          <button type="button" onClick={loadRate} disabled={loadingRate} className={button}>{loadingRate ? "Consultando…" : "Usar cotización de referencia"}</button>
          {rateDate && <p className="self-center text-sm text-ink/75">BCE · {rateDate}</p>}
        </div>
        <details className="rounded-lg border border-ink/15 bg-paper p-3">
          <summary className="cursor-pointer font-semibold">Pegar una lista de variantes</summary>
          <label className="mt-2 block text-sm">Una variante por línea en formato «Variante | precio RMB».
            <textarea rows={3} maxLength={2400} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Caja de 30 sobres | 375\nSobre suelto | 15"} className={field} />
          </label>
          <button type="button" onClick={importList} className={`${button} mt-2`}>Agregar variantes de la lista</button>
        </details>
        {variants.map((row, i) => {
          const rmb = quoteDecimal(row.rmb, 2);
          const usd = rmb && validRate ? usdFromRmb(rmb, validRate) : null;
          const logistics = quoteDecimal(row.logistics, 2);
          return (
            <fieldset key={row.key} className="min-w-0 rounded-lg border border-ink/20 p-3">
              <legend className="px-1 text-sm font-semibold">Variante {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="min-w-0 text-sm font-semibold">Nombre
                  <input required maxLength={120} value={row.name} onChange={(e) => update(row, { name: e.target.value })} className={field} />
                </label>
                <label className="min-w-0 text-sm font-semibold">Precio Taobao (RMB)
                  <input required inputMode="decimal" maxLength={11} value={row.rmb} onChange={(e) => update(row, { rmb: e.target.value })} className={field} />
                </label>
                <label className="min-w-0 text-sm font-semibold">Envío y aduana (USD, opcional)
                  <input inputMode="decimal" maxLength={11} value={row.logistics} onChange={(e) => update(row, { logistics: e.target.value })} className={field} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {row.photo && <Image src={row.photo} unoptimized width={80} height={80} className="size-20 rounded-md border border-ink/15 object-contain" alt={row.name || "Foto de la variante"} />}
                <label className="min-w-0 max-w-full text-sm font-semibold">Foto de la variante
                  <input type="file" accept={photos.join(",")} disabled={loadingPhoto} onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (file) void loadPhoto(row, file);
                  }} className="mt-1 block max-w-full text-sm file:mr-2 file:min-h-11 file:rounded-md file:border file:border-ink/30 file:bg-paper file:px-2" />
                </label>
                {row.photo && <button type="button" className={button} onClick={() => update(row, { photo: null })}>Quitar foto</button>}
                {variants.length > 1 && <button type="button" className={button} disabled={loadingPhoto} onClick={() => setVariants((all) => all.filter((item) => item.key !== row.key))}>Quitar variante</button>}
              </div>
              {usd !== null && <p className="mt-2 text-sm text-ink/80">Producto <strong>{quoteAmount(usd, "USD")}</strong>{logistics !== null && <> · Total estimado <strong>{quoteAmount(usd + logistics, "USD")}</strong></>}</p>}
            </fieldset>
          );
        })}
        {variants.length < MAX_QUOTE_VARIANTS && <button type="button" className={button} onClick={addVariant}>+ Agregar variante</button>}
      </fieldset>
      {error && <p role="alert" className="text-sm font-semibold text-vermilion">{error}</p>}
      <button type="submit" disabled={busy || loadingPhoto || loadingRate} className="min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : loadingPhoto ? "Preparando foto…" : "Guardar cotización"}</button>
    </form>
  );
}

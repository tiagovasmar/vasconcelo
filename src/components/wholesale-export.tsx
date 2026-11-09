"use client";

import { useEffect, useRef, useState } from "react";

export function WholesaleExport({ productIds, minBoxes }: { productIds: string[]; minBoxes?: number | null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<{ url: string; filename: string }[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; filename: string } | null>(null);
  const snapshot = useRef<{ blobs: Blob[]; generatedAt: number; date: string } | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);

  async function generate() {
    setBusy(true); setMessage("");
    urls.current.forEach(URL.revokeObjectURL); urls.current = []; setImages([]); setPdf(null); snapshot.current = null;
    try {
      const response = await fetch("/api/mayoristas/exportar", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "No pudimos actualizar el catálogo.");
      const { renderCatalogImages, exportDate } = await import("@/features/mayorista/export-image");
      const ids = new Set(productIds);
      data.rows = data.rows.filter((row: { productId: string }) => ids.has(row.productId));
      if (!data.rows.length) throw new Error("No hay productos con precio para exportar con estos filtros.");
      const result = await renderCatalogImages(data);
      snapshot.current = { blobs: result.blobs, generatedAt: data.generatedAt, date: exportDate(data.generatedAt).replaceAll("/", "-") };
      urls.current = result.blobs.map((blob) => URL.createObjectURL(blob));
      setImages(urls.current.map((url, i) => ({ url, filename: `vasconcelo-mayorista-${exportDate(data.generatedAt).replaceAll("/", "-")}-${i + 1}.png` })));
      setMessage(`Generado con precios actualizados. ${result.missing ? `${result.missing} productos sin foto: figuran con nombre y precio.` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos generar las imágenes. Intentá nuevamente.");
    } finally { setBusy(false); }
  }

  async function downloadPdf() {
    const source = snapshot.current;
    if (!source || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { catalogPdf } = await import("@/features/mayorista/export-pdf");
      const blob = await catalogPdf(source.blobs, source.generatedAt);
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      const filename = `vasconcelo-mayorista-${source.date}-completo.pdf`;
      setPdf({ url, filename });
      const link = document.createElement("a");
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
    } catch {
      setMessage("No pudimos crear el PDF. Podés reintentar o descargar los PNG.");
    } finally { setPdfBusy(false); }
  }

  return <section className="my-4 rounded-lg border border-ink/20 bg-white p-4" aria-label="Exportar catálogo mayorista">
    {minBoxes && <p className="mb-3 font-bold text-emerald">Compra mínima mayorista: {minBoxes} cajas en total.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold">Catálogo para compartir</h2><p className="text-sm text-ink/75">Fotos, nombres y precio base en USD. Incluye fecha y cotización; respeta los filtros actuales.</p></div>
      <button type="button" onClick={generate} disabled={busy || pdfBusy || !productIds.length} className="min-h-11 rounded-md bg-emerald px-4 font-bold text-white disabled:opacity-50">{busy ? "Generando láminas…" : "Generar imágenes"}</button>
    </div>
    <p className="mt-2 text-xs text-ink/75">Solo productos con precio. Hasta 6 por lámina, con marca de agua. Descargá PNG individuales o un PDF con todas las láminas. Cada generación consulta los precios vigentes.</p>
    <p role="status" aria-live="polite" className="mt-2 text-sm">{message}</p>
    {images.length > 0 && <div className="mt-3">{pdf ? <a href={pdf.url} download={pdf.filename} className="inline-flex min-h-11 items-center rounded-md bg-emerald px-4 font-bold text-white">Descargar PDF completo</a> : <button type="button" onClick={downloadPdf} disabled={pdfBusy} className="min-h-11 rounded-md bg-emerald px-4 font-bold text-white disabled:opacity-50">{pdfBusy ? "Preparando PDF…" : "Descargar PDF completo"}</button>}</div>}
    {images.length > 0 && <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{images.map((img, i) => <div key={img.url} className="min-w-0">
      {/* El PNG se genera localmente, no es una imagen remota optimizable por Next. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.url} alt={`Vista previa de la lámina mayorista ${i + 1}`} width={1080} height={1560} className="h-auto w-full rounded-md border border-ink/10" />
      <a href={img.url} download={img.filename} className="mt-2 inline-flex min-h-11 items-center font-bold underline">Descargar PNG · lámina {i + 1}</a>
    </div>)}</div>}
  </section>;
}

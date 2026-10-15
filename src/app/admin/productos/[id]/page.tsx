import { notFound } from "next/navigation";
import { AdminProductEditor, type EditorData, type GalleryItem } from "@/components/admin-product-editor";
import type { RowState } from "@/components/admin-product-table";
import { catalog } from "@/content/catalog";
import { kindLabel, languageLabel, type ImageAsset } from "@/content/schema";
import { getDb } from "@/db/client";
import { commercialState } from "@/features/catalog/commercial";
import { libraryImages } from "@/features/catalog/gallery";
import { adminProducts, parseGallery, loadGalleries } from "@/features/catalog/overrides";
import { ageLabel, formatRate } from "@/features/fx/convert";
import { currentRate } from "@/features/fx/service";
import { mediaAssets } from "@/db/schema";
import { hasAsset } from "@/components/slot";
import { requireAdmin } from "@/server/admin";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

const thumbOf = (src: string) => (src.startsWith("/images/uploads/") ? src.replace(/\.webp$/, "-t.webp") : src);
const toItem = (i: ImageAsset, uploaded: Set<string> = new Set()): GalleryItem => ({ src: i.src, thumb: thumbOf(i.src), alt: i.alt, width: i.width, height: i.height, source: i.source, upload: i.src.startsWith("/images/uploads/"), origin: i.origin, missing: i.src.startsWith("/images/uploads/") ? !uploaded.has(i.src) : !hasAsset(i.src) });
const when = (ms: number, who: string | null) => `${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms))}${who ? ` por ${who}` : ""}`;

export default async function EditarProducto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/productos/${id}`);
  const base = catalog.products.find((p) => p.id === id);
  if (!base) notFound();
  const db = getDb();
  const fx = await currentRate(db);
  const a = (await adminProducts(db, [base], fx))[0];
  const uploaded = new Set((await db.select({ id: mediaAssets.id }).from(mediaAssets)).map((m) => `/images/uploads/${m.id}`));
  const p = a.product;
  const customGallery = parseGallery((await loadGalleries(db)).get(id));
  const exps = p.expansionIds.map((e) => catalog.expansions.find((x) => x.id === e)?.name).filter(Boolean);
  const state: RowState = base.retired ? "retired" : !p.active ? (base.draftNote ? "draft" : "hidden") : p.orderOnly ? "order" : commercialState(p);
  const rateLabel = fx.rate10k
    ? `Cotización vigente: ${formatRate(fx.rate10k)} por dólar (${fx.mode === "manual" ? "valor manual" : "dólar blue venta"}${fx.asOf && fx.mode === "auto" ? `, consultada ${ageLabel(nowMs() - fx.asOf)}` : ""}).`
    : "No hay una cotización utilizable: el precio en pesos queda pendiente hasta que se resuelva (ver Cotización).";
  const data: EditorData = {
    id: p.id, sku: p.sku, slug: p.slug, kind: kindLabel[p.kind], language: languageLabel[p.language], expansion: exps.join(", ") || "—", state,
    version: a.version, overridden: a.overridden, updatedLabel: a.updatedAt ? when(a.updatedAt, a.updatedByEmail) : null,
    codeTitle: a.codeTitle, codeDescription: a.codeDescription, title: p.title, description: p.description,
    usdMinor: p.priceUsdMinor ?? null, arsMinor: p.priceMinor, stock: p.stockQuantity, maxPerOrder: p.maxPerOrder ?? null, visible: p.active, orderOnly: Boolean(p.orderOnly),
    draftNote: base.draftNote ?? null, retired: Boolean(base.retired), legacyPriceMinor: a.legacyPriceMinor, rate10k: fx.rate10k, rateLabel,
    gallery: { items: (customGallery ?? base.images).map((i) => toItem(i, uploaded)), custom: Boolean(customGallery), version: a.gallery.version, codeItems: base.images.map((i) => toItem(i, uploaded)) },
    library: (await libraryImages(db, catalog.products)).filter((l) => hasAsset(l.src)).map((l) => ({ src: l.src, thumb: thumbOf(l.src), alt: l.alt, from: l.from })),
  };
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8 sm:py-10">
      <AdminProductEditor data={data} />
    </div>
  );
}

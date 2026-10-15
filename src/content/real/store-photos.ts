import type { ImageAsset } from "../schema";
import raw from "./store-photos.json";

/** Foto real del stock de la tienda (la aporta el dueño). Se muestra aparte de las fotos de referencia del fabricante. */
export type StorePhoto = {
  file: string;
  width: number;
  height: number;
  view: NonNullable<ImageAsset["view"]>;
  alt: string;
  /** Fecha en que se tomó (AAAA-MM-DD). */
  takenAt: string;
};
export type StorePhotos = { photos: Record<string, StorePhoto[]> };

const toImage = (p: StorePhoto): ImageAsset => ({
  src: p.file, alt: p.alt, width: p.width, height: p.height, status: "final", source: "store", view: p.view,
  origin: `Foto propia de la tienda, tomada el ${p.takenAt}`, license: "Foto propia de la tienda: puede mostrarse en el sitio.",
});

/** Fotos propias de un SKU, en el orden cargado. */
export const storePhotosFor = (sku: string, data: StorePhotos = raw as StorePhotos): ImageAsset[] => (data.photos[sku] ?? []).map(toImage);

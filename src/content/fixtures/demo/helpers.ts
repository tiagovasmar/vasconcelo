import type { ImageAsset } from "../../schema";

/** Imagen de reserva: el archivo aún no existe; se muestra la ilustración temporal hasta que se agregue. */
export function demoImage(src: string, alt: string, width = 1000, height = 1000): ImageAsset {
  return { src, alt, width, height, status: "demo", origin: "Pendiente: imagen final por aportar", license: "Sin imagen final registrada" };
}

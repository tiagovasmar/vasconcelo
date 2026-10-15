import type { Product } from "@/content/schema";

/** Fondo de la tarjeta/galería según el tono del producto (módulo sin dependencias de servidor: se usa también en el navegador). */
export const toneBg: Record<Product["fallbackTone"], string> = {
  mint: "bg-[#cfe9dc]",
  ink: "bg-[#14231e] text-paper",
  paper: "bg-[#e5dcc8]",
  violet: "bg-[#2a1f4d] text-paper",
  gold: "bg-[#efe0b8]",
};

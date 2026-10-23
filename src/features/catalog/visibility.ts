import type { Product } from "@/content/schema";

/** Visibilidad en listados, independiente de disponibilidad para vender adicionales. */
export const isListedProduct = (p: Pick<Product, "active" | "addonOnly">): boolean => p.active && !p.addonOnly;

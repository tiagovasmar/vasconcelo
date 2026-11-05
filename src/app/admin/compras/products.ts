import { catalog } from "@/content/catalog";

export const purchaseProducts = () => catalog.products.map((p) => ({ value: p.id, label: `${p.title} · ${p.sku}` }));

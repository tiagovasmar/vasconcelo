import type { AdminRow } from "@/components/admin-product-table";

export const productFilters = [
  { id: "todos", label: "Todos" },
  { id: "sin-precio", label: "Sin precio" },
  { id: "soldout", label: "Sin stock" },
  { id: "low", label: "Stock bajo" },
  { id: "available", label: "Disponibles" },
  { id: "order", label: "Por encargo" },
  { id: "hidden", label: "Ocultos y borradores" },
  { id: "retired", label: "Retirados" },
  { id: "pending", label: "Disponibilidad a confirmar" },
] as const;

export function matchesProductFilter(row: Pick<AdminRow, "state" | "priceBase" | "usdMinor" | "arsMinor" | "stock" | "lowStock">, filter: typeof productFilters[number]["id"]) {
  if (filter === "todos") return row.state !== "retired";
  if (filter === "hidden") return row.state === "hidden" || row.state === "draft";
  if (filter === "retired") return row.state === "retired";
  const published = !["retired", "hidden", "draft"].includes(row.state);
  if (filter === "sin-precio") return published && (row.priceBase === "ars" ? row.arsMinor : row.usdMinor ?? row.arsMinor) === null;
  if (filter === "soldout") return published && row.state !== "order" && row.stock === 0;
  if (filter === "low") return row.lowStock;
  return row.state === filter;
}

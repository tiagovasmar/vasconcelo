/** «12.500,50» → 1250050 (centavos). null si no es un importe. Sin dependencias: lo usan el navegador y el servidor. */
export function parseMoney(text: string): number | null {
  if (/[-−]/.test(text)) return null;
  const t = text.replace(/[^\d.,]/g, "");
  if (!t) return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

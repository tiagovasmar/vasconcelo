import { SaleError } from "@/features/sales/errors";
import { MAX_QUOTE_RATE, MIN_QUOTE_RATE } from "@/lib/taobao-quote";
import { adminAction } from "@/server/admin-api";

const source = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export function POST(req: Request) {
  return adminAction(req, "proveedores-cotizacion-rmb", async () => {
    try {
      const response = await fetch(source, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4500) });
      if (!response.ok) throw new Error();
      const xml = await response.text();
      const date = xml.match(/\btime=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
      const usd = Number(xml.match(/\bcurrency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/)?.[1]);
      const cny = Number(xml.match(/\bcurrency=['"]CNY['"]\s+rate=['"]([\d.]+)['"]/)?.[1]);
      const rate = Math.round(cny * 10_000 / usd);
      if (!date || !Number.isFinite(rate) || rate < MIN_QUOTE_RATE || rate > MAX_QUOTE_RATE) throw new Error();
      return { date, rate };
    } catch {
      throw new SaleError(503, "not_configured", "No pudimos obtener la cotización de referencia. Podés ingresar la de tu agente.");
    }
  }, { body: false, limit: 15 });
}

import Link from "next/link";
import { getDb } from "@/db/client";
import { catalog } from "@/content/catalog";
import { listAudit } from "@/features/catalog/overrides";
import { formatARS } from "@/lib/format";
import { formatUSD } from "@/features/fx/convert";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

const FIELDS: Record<string, string> = { price_usd_minor: "Precio base (USD)", order_only: "Por encargo", title: "Título", description: "Descripción", gallery: "Fotos", gallery_reset: "Fotos restablecidas al código", price_minor: "Precio (ARS, anterior)", stock_quantity: "Stock", max_per_order: "Máx. por pedido", visible: "Visibilidad", reset: "Restablecido al código" };
const when = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));

function value(field: string, raw: string): string {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (field === "reset") {
    const o = v as { priceUsdMinor?: number | null; legacyPriceMinor?: number | null; priceMinor?: number | null; stockQuantity: number | null; maxPerOrder: number | null; visible: boolean };
    const usd = o.priceUsdMinor === undefined ? (o.priceMinor === undefined || o.priceMinor === null ? "pendiente" : formatARS(o.priceMinor)) : o.priceUsdMinor === null ? "pendiente" : formatUSD(o.priceUsdMinor);
    return `precio ${usd}, stock ${o.stockQuantity ?? "pendiente"}, máx. ${o.maxPerOrder ?? "sin tope"}, ${o.visible ? "visible" : "oculto"}`;
  }
  if (field === "price_usd_minor") return v === null ? "pendiente" : formatUSD(v as number);
  if (field === "order_only") return v ? "sí" : "no";
  if (field === "title" || field === "description") return v === null ? "(el del catálogo)" : String(v).slice(0, 140);
  if (field === "gallery" || field === "gallery_reset") return Array.isArray(v) ? `${v.length} foto${v.length === 1 ? "" : "s"}: ${(v as Array<{ src: string }>).map((x) => x.src.split("/").pop()).join(", ")}`.slice(0, 220) : String(v);
  if (field === "price_minor") return v === null ? "pendiente" : formatARS(v as number);
  if (field === "stock_quantity") return v === null ? "pendiente" : String(v);
  if (field === "max_per_order") return v === null ? "sin tope" : String(v);
  if (field === "visible") return v ? "visible" : "oculto";
  return String(v);
}

export default async function Historial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/historial");
  const sp = await searchParams;
  const productId = typeof sp.producto === "string" ? sp.producto.slice(0, 80) : undefined;
  const product = productId ? catalog.products.find((p) => p.id === productId) : undefined;
  const rows = await listAudit(getDb(), { productId: product?.id, limit: 300 });
  const title = new Map(catalog.products.map((p) => [p.id, p.title]));
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Historial de cambios</h1>
      <p className="mt-2 text-sm text-ink/75">
        {product ? <>Cambios de <b>{product.title}</b>. <Link href="/admin/historial" className="underline">Ver todos</Link></> : "Los últimos 300 cambios de precio, stock, máximo por pedido y visibilidad: quién, cuándo, valor anterior y valor nuevo."}
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70" data-testid="historial-vacio">Todavía no hay cambios registrados.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-ink/15 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm" data-testid="historial">
            <thead className="bg-paper text-xs uppercase tracking-wide text-ink/70">
              <tr><th scope="col" className="px-3 py-2">Cuándo</th><th scope="col" className="px-3 py-2">Quién</th><th scope="col" className="px-3 py-2">Producto</th><th scope="col" className="px-3 py-2">Dato</th><th scope="col" className="px-3 py-2">Antes</th><th scope="col" className="px-3 py-2">Ahora</th></tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2">{when(r.createdAt)}</td>
                  <td className="px-3 py-2">{r.userEmail}</td>
                  <td className="px-3 py-2"><span className="block font-medium">{title.get(r.productId) ?? r.productId}</span><span className="font-mono text-xs text-ink/60">{r.sku}</span></td>
                  <td className="px-3 py-2">{FIELDS[r.field] ?? r.field}</td>
                  <td className="px-3 py-2">{value(r.field, r.oldValue)}</td>
                  <td className="px-3 py-2 font-medium">{value(r.field, r.newValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

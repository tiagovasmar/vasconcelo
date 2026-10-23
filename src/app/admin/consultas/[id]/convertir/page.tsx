import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminSaleForm, type SaleProduct } from "@/components/admin-sale-form";
import { catalog } from "@/content/catalog";
import { getDb } from "@/db/client";
import { getLowStock, isLowStock } from "@/features/admin/settings";
import { adminProducts } from "@/features/catalog/overrides";
import { getInquiryDetail } from "@/features/consultas/service";
import { salePaymentOf } from "@/features/consultas/ui";
import { currentRate } from "@/features/fx/service";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

/**
 * Convertir una consulta en venta: se precarga la persona, los productos «del stock», las cantidades y los precios cotizados; se puede revisar y editar todo
 * antes de confirmar. Los productos por encargo no entran en la venta (no salen del stock propio): se listan aparte.
 */
export default async function ConvertirConsulta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/consultas/${id}/convertir`);
  const db = getDb();
  const d = await getInquiryDetail(db, id);
  if (!d) notFound();
  if (d.activeSale) redirect(`/admin/consultas/${id}`);
  const { inquiry: i, lines } = d;
  const [fx, low] = await Promise.all([currentRate(db), getLowStock(db)]);
  const products: SaleProduct[] = (await adminProducts(db, catalog.products, fx))
    .filter((a) => !catalog.products.find((x) => x.id === a.product.id)?.retired)
    .map((a) => ({ id: a.product.id, sku: a.product.sku, title: a.product.title, language: a.product.language, stock: a.product.stockQuantity, priceMinor: a.product.priceMinor, low: isLowStock(a.product.stockQuantity, Boolean(a.product.orderOnly), low.threshold), orderOnly: Boolean(a.product.orderOnly), packSize: a.product.packSize ?? null }));
  const known = new Set(products.map((p) => p.id));
  const stockLines = lines.filter((l) => l.fulfillment !== "encargo" && known.has(l.productId));
  const encargos = lines.filter((l) => l.fulfillment === "encargo");
  const dropped = lines.filter((l) => l.fulfillment !== "encargo" && !known.has(l.productId));
  const name = i.contactName ?? d.accountName ?? "Sin nombre";

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-sm"><Link href={`/admin/consultas/${id}`} className="underline underline-offset-4">← Volver a la consulta {id}</Link></p>
      <p className="eyebrow mt-3 text-emerald">Convertir en venta</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="convertir-titulo">Venta para {name}</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/75">
        Precargamos los productos, las cantidades y los precios de la consulta. Editá lo que haga falta (por ejemplo, si vendiste menos unidades o a otro precio) y revisá el resumen con el total y cómo queda el stock. Al confirmar se guarda la venta, se descuenta <b>solo lo que confirmes</b> y se vincula a la consulta, todo junto. La consulta original no cambia.
      </p>
      {i.discountMinor + i.comboDiscountMinor > 0 && stockLines.some((l) => l.comboDiscountMinor + l.transferDiscountMinor > 0) && <p className="mt-2 max-w-2xl rounded-lg bg-gold/20 p-3 text-sm" data-testid="aviso-descuento">La consulta incluía descuentos ({i.comboDiscountMinor > 0 ? `combo caja + sobres ${formatARS(i.comboDiscountMinor)}` : ""}{i.comboDiscountMinor > 0 && i.discountMinor > 0 ? " y " : ""}{i.discountMinor > 0 ? `transferencia ${formatARS(i.discountMinor)}` : ""}). Quedan precargados por línea: la venta <b>no vuelve a calcular ninguna promoción</b>; podés ajustarlos si cambió algo.</p>}
      {i.discountMinor > 0 && !stockLines.some((l) => l.comboDiscountMinor + l.transferDiscountMinor > 0) && <p className="mt-2 max-w-2xl rounded-lg bg-gold/20 p-3 text-sm" data-testid="aviso-descuento">La consulta incluía un descuento de {formatARS(i.discountMinor)} (transferencia) guardado antes de que se registraran los descuentos por línea. Cargalo en el campo «Descuento» de cada línea si lo aplicás.</p>}
      {encargos.length > 0 && (
        <div className="mt-3 max-w-2xl rounded-lg border border-ink/20 bg-white p-3 text-sm" data-testid="aviso-encargos">
          <b>Por encargo (no entran en esta venta):</b> {encargos.map((l) => `${l.quantity} × ${l.title}`).join(", ")}. Se piden al proveedor y no salen de tu stock; si más adelante los tenés, registrá otra venta.
        </div>
      )}
      {dropped.length > 0 && <p className="mt-3 max-w-2xl rounded-lg border border-vermilion/40 bg-vermilion/5 p-3 text-sm" role="note">No se precargaron porque ya no se pueden vender: {dropped.map((l) => l.title).join(", ")}.</p>}
      <div className="mt-6">
        <AdminSaleForm
          products={products}
          inquiry={{ id: i.id, name, payment: salePaymentOf(i.paymentPreference), lines: stockLines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, discountMinor: l.comboDiscountMinor + l.transferDiscountMinor })) }}
        />
      </div>
    </div>
  );
}

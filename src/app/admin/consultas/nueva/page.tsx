import { AdminInquiryForm, type ManualProduct } from "@/components/admin-inquiry-form";
import { catalog } from "@/content/catalog";
import { getDb } from "@/db/client";
import { adminProducts } from "@/features/catalog/overrides";
import { currentRate } from "@/features/fx/service";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

export default async function NuevaConsulta() {
  await requireAdmin("/admin/consultas/nueva");
  const db = getDb();
  const fx = await currentRate(db);
  const products: ManualProduct[] = (await adminProducts(db, catalog.products, fx))
    .filter((a) => !catalog.products.find((x) => x.id === a.product.id)?.retired)
    .map((a) => ({ id: a.product.id, sku: a.product.sku, title: a.product.title, language: a.product.language, stock: a.product.stockQuantity, priceMinor: a.product.priceMinor, orderOnly: Boolean(a.product.orderOnly) }));
  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Cargar una consulta manual</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/75">Para consultas que llegaron por otro medio (WhatsApp directo, redes, en persona). Queda con el contacto ya confirmado, no reserva ni descuenta stock y la ves en el listado como cualquier otra.</p>
      <AdminInquiryForm products={products} />
    </div>
  );
}

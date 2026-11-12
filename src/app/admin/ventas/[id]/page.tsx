import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSalesList } from "@/components/admin-sales-list";
import { getDb } from "@/db/client";
import { loadSale } from "@/features/sales/service";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

export default async function Venta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/ventas/${encodeURIComponent(id)}`);
  const sale = await loadSale(getDb(), id);
  if (!sale) notFound();
  return (
    <div className="mx-auto max-w-[850px] px-4 py-8 sm:px-8">
      <p className="eyebrow text-emerald">Contabilidad</p>
      <h1 className="mt-2 text-2xl font-semibold">Detalle de la venta</h1>
      <div className="mt-3"><AdminSalesList sales={[sale]} /></div>
      <Link href="/admin/ventas" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">Ver todas las ventas</Link>
    </div>
  );
}

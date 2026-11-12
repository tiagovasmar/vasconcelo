import { arrivalEstimate } from "@/content/incoming-arrivals";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/product-image";
import { storefrontOnce } from "@/features/admin/storefront";
import { listProducts } from "@/features/catalog/data";
import { publicUpcoming } from "@/features/importaciones/public-upcoming";

export const dynamic = "force-dynamic";
export const metadata = { title: "Próximamente" };

export default async function UpcomingPage() {
  if (!(await storefrontOnce()).upcomingEnabled) notFound();
  const [products, quantities] = await Promise.all([listProducts(), publicUpcoming()]);
  const upcoming = products.filter((p) => quantities.has(p.id));
  return <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-8">
    <p className="eyebrow text-emerald">Vasconcelo</p>
    <h1 className="mt-2 text-4xl font-semibold">Próximamente</h1>
    <p className="mt-2 max-w-xl text-sm text-ink/75">Conocé los próximos ingresos de la tienda.</p>
    {!upcoming.length && <p className="mt-6 rounded-xl border border-ink/20 bg-white p-4">Todavía no hay ingresos anunciados.</p>}
    <ul className="mt-6 grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 md:grid-cols-3">
      {upcoming.map((p) => <li className="min-w-0 overflow-hidden rounded-xl border border-ink/20 bg-white" key={p.id}>
        <Link href={`/productos/${p.slug}`} className="block">
          <div className="relative aspect-[4/3] bg-paper-2"><ProductImage product={p} sizes="(min-width:768px) 320px, 90vw" /></div>
          <div className="p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald">{quantities.get(p.id)?.traveling ? "En camino" : "Próximamente"}</p>
            <h2 className="mt-1 break-words text-base font-semibold">{p.title}</h2>
            {quantities.get(p.id)?.fromPurchase && <p className="mt-1 text-sm">{arrivalEstimate(p.id)}</p>}
          </div>
        </Link>
      </li>)}
    </ul>
  </div>;
}

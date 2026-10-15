import type { Metadata } from "next";
import Link from "next/link";
import { AccountHeader, AccountNav } from "@/components/account-shell";
import { ProductCard } from "@/components/product-card";
import { getDb } from "@/db/client";
import { listFavoriteProducts } from "@/features/account/favorites";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Favoritos", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Favoritos() {
  const user = await requireUser("/cuenta/favoritos");
  const products = await listFavoriteProducts(getDb(), user.id);
  return (
    <>
      <AccountHeader eyebrow="Mi cuenta" title="Tus favoritos." />
      <AccountNav current="favoritos" />
      <div className="paper-texture">
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8">
          {products.length === 0 ? (
            <div className="border border-dashed border-ink/40 bg-white/60 p-8 text-center sm:p-14" data-testid="favoritos-vacio">
              <p className="display text-4xl normal-case">Todavía no guardaste favoritos.</p>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink/70">Tocá el corazón de un producto sellado para guardarlo acá.</p>
              <Link href="/sellados" className="mt-6 inline-block bg-gold px-6 py-3.5 font-bold hover:bg-ink hover:text-paper">Explorar sellados</Link>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:gap-5 lg:grid-cols-4">
              {products.map((p) => (
                <li key={p.id}><ProductCard product={p} /></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

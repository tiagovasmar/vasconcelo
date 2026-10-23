import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Panel del dueño", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper">
      <nav aria-label="Panel del dueño" className="border-b border-ink/15 bg-emerald text-paper">
        <ul className="mx-auto flex max-w-[1240px] flex-wrap gap-x-6 gap-y-2 px-4 py-3 text-sm font-semibold sm:px-8">
          <li><Link href="/admin" className="underline-offset-4 hover:underline">Productos</Link></li>
          <li><Link href="/admin/consultas" className="underline-offset-4 hover:underline">Consultas</Link></li>
          <li><Link href="/admin/ventas" className="underline-offset-4 hover:underline">Ventas</Link></li>
          <li><Link href="/admin/promociones" className="underline-offset-4 hover:underline">Promociones</Link></li>
          <li><Link href="/admin/cotizacion" className="underline-offset-4 hover:underline">Cotización</Link></li>
          <li><Link href="/admin/mayoristas" className="underline-offset-4 hover:underline">Mayoristas</Link></li>
          <li><Link href="/admin/historial" className="underline-offset-4 hover:underline">Historial de cambios</Link></li>
          <li className="ml-auto"><Link href="/" className="font-normal text-paper/80 underline-offset-4 hover:underline">Ver la tienda</Link></li>
        </ul>
      </nav>
      {children}
    </div>
  );
}

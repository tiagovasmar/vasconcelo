"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

const groups = [
  { label: "Inicio", links: [["", "Inicio"]] },
  { label: "Productos", links: [["productos", "Precios y stock"], ["historial", "Historial de cambios"]] },
  { label: "Operaciones", links: [["pedidos", "Pedidos"], ["consultas", "Consultas"], ["compras", "Compras e importaciones"], ["envios", "Envíos"]] },
  { label: "Contabilidad", links: [["ventas", "Ventas y gastos"], ["costos", "Ganancia y comisiones"]] },
  { label: "Configuración", links: [["cotizacion", "Cotización"], ["promociones", "Promociones"], ["reposicion", "Reposición"], ["avisos", "Avisos"], ["mayoristas", "Mayoristas"]] },
] as const;

const href = (segment: string) => segment ? `/admin/${segment}` : "/admin";

export function AdminNavigation({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment() ?? "";
  const current = groups.find((group) => group.links.some(([path]) => path === segment));
  return (
    <>
      <nav aria-label="Panel del dueño" className="border-b border-ink/15 bg-white px-3 py-2 lg:border-r lg:border-b-0 lg:px-2 lg:py-5">
        <ul className="flex flex-wrap gap-1 lg:flex-col">
          {groups.map((group) => (
            <li key={group.label}>
              <Link href={href(group.links[0][0])} prefetch={false} aria-current={current === group ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-semibold hover:bg-paper-2 lg:flex ${current === group ? "bg-emerald/10 font-bold text-emerald" : ""}`}>{group.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        {current && current.links.length > 1 && (
          <nav aria-label={current.label} className="flex flex-wrap gap-x-3 border-b border-ink/15 px-4 sm:px-6">
            {current.links.map(([path, label]) => (
              <Link key={path} href={href(path)} prefetch={false} aria-current={segment === path ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-1 text-sm ${segment === path ? "border-emerald font-bold text-emerald" : "border-transparent hover:border-ink/40"}`}>{label}</Link>
            ))}
          </nav>
        )}
        {children}
      </div>
    </>
  );
}

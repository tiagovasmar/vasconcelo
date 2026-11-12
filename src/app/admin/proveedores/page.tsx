import Link from "next/link";
import { AdminButton, AdminForm, type FormField } from "@/components/admin-form";
import { getDb } from "@/db/client";
import { listTaobaoSuppliers } from "@/features/admin/taobao-suppliers";
import { requireAdmin } from "@/server/admin";

const path = "/admin/proveedores";
const endpoint = "/api/admin/proveedores";
const card = "rounded-xl border border-ink/15 bg-white p-4 sm:p-5";
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const supplierFields = (supplier?: { name: string; url: string; note: string | null }): FormField[] => [
  { name: "name", label: "Nombre del proveedor", required: true, maxLength: 80, defaultValue: supplier?.name },
  { name: "url", label: "Enlace de Taobao o Tmall", required: true, maxLength: 2048, placeholder: "https://…", defaultValue: supplier?.url },
  { name: "note", label: "Notas internas", type: "textarea", maxLength: 1000, placeholder: "Qué vende, qué compraste o qué te confirmó sobre el sellado.", defaultValue: supplier?.note ?? "" },
];

export default async function Proveedores({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  await requireAdmin(path);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const archived = params.estado === "archivados";
  const suppliers = await listTaobaoSuppliers(getDb());
  const results = suppliers.filter((row) => row.archived === archived && normalize(`${row.name} ${row.note ?? ""} ${row.url}`).includes(normalize(query)));

  return (
    <div className="mx-auto max-w-[1080px] space-y-5 px-4 py-8 sm:px-8">
      <header>
        <p className="eyebrow text-emerald">Operaciones · privado</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Proveedores de Taobao</h1>
        <p className="mt-2 text-sm text-ink/75">Guardá el enlace de cada tienda o publicación y tus notas para la próxima compra.</p>
      </header>
      <details className={card}>
        <summary className="min-h-8 cursor-pointer font-semibold">+ Agregar proveedor</summary>
        <div className="mt-3">
          <AdminForm endpoint={endpoint} fixed={{ action: "create" }} fields={supplierFields()} submit="Guardar proveedor" ok="Proveedor guardado." />
        </div>
      </details>
      <section aria-labelledby="proveedores-guardados" className={card}>
        <h2 id="proveedores-guardados" className="text-lg font-semibold">Proveedores guardados</h2>
        <form action={path} role="search" className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 basis-56 text-sm font-semibold">Buscar por nombre, enlace o notas
            <input name="q" type="search" maxLength={120} defaultValue={query} className="mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base" />
          </label>
          <label className="text-sm font-semibold">Estado
            <select name="estado" defaultValue={archived ? "archivados" : "activos"} className="mt-1 block min-h-11 rounded-md border border-ink/40 bg-white px-3">
              <option value="activos">Activos</option>
              <option value="archivados">Archivados</option>
            </select>
          </label>
          <button className="min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-paper hover:bg-emerald">Buscar</button>
        </form>
        {results.length === 0 ? <p className="mt-4 text-sm text-ink/70">{query ? "Ningún proveedor coincide con la búsqueda." : archived ? "Todavía no hay proveedores archivados." : "Todavía no hay proveedores guardados."}</p> : (
          <ul className="mt-4 divide-y divide-ink/15">
            {results.map((row) => (
              <li key={row.id} className="min-w-0 py-3" data-testid="proveedor-fila">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <h3 className="min-w-0 break-words font-semibold">{row.name}</h3>
                  <Link href={row.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Abrir en Taobao o Tmall ↗</Link>
                </div>
                {row.note && <p className="whitespace-pre-wrap break-words text-sm text-ink/75">{row.note}</p>}
                <Link href={`${path}/${row.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald underline underline-offset-4">Ver productos y cotizaciones</Link>
                <details className="mt-2">
                  <summary className="min-h-8 cursor-pointer text-sm font-semibold">Editar proveedor</summary>
                  <div className="mt-2 rounded-lg border border-ink/15 bg-paper p-3">
                    <AdminForm key={row.version} endpoint={endpoint} fixed={{ action: "edit", id: row.id, version: row.version }} fields={supplierFields(row)} submit="Guardar cambios" idempotent={false} />
                  </div>
                </details>
                <AdminButton endpoint={endpoint} body={{ action: "archive", id: row.id, version: row.version, archived: !row.archived }} label={row.archived ? "Restaurar proveedor" : "Archivar proveedor"} confirmText={row.archived ? undefined : `¿Archivar a ${row.name}?`} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

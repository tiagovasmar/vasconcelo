import { AdminButton } from "@/components/admin-form";
import { getDb } from "@/db/client";
import { waitingCounts } from "@/features/avisos/reposicion";
import { listAllProducts } from "@/features/catalog/data";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

/** «Avisame cuando vuelva»: cuántas personas esperan cada producto agotado. Los avisos los disparás vos cuando repones; no reservan stock ni garantizan precio. */
export default async function AdminReposicion() {
  await requireAdmin("/admin/reposicion");
  const db = getDb();
  const [counts, products] = await Promise.all([waitingCounts(db), listAllProducts(undefined, db)]);
  const rows = products.filter((p) => counts.has(p.id)).map((p) => ({ p, n: counts.get(p.id)! })).sort((a, b) => b.n - a.n);
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Avisos de reposición</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">Personas que pidieron que les avises cuando vuelva un producto agotado. Es un registro de interés: no es una consulta ni una venta y no reserva stock. Cuando cargues la entrada de mercadería, podés avisarles con un botón (un solo correo por persona).</p>
      {rows.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70" data-testid="reposicion-vacio">Nadie está esperando ningún producto.</p> : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-ink/15 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="bg-paper-2 text-left text-xs uppercase tracking-wide"><th className="p-2">Producto</th><th className="p-2 text-right">Esperando</th><th className="p-2 text-right">Stock actual</th><th className="p-2"></th></tr></thead>
            <tbody>
              {rows.map(({ p, n }) => (
                <tr key={p.id} className="border-t border-ink/10" data-testid="reposicion-fila">
                  <td className="p-2">{p.title}<span className="block font-mono text-xs text-ink/55">{p.sku}</span></td>
                  <td className="p-2 text-right text-lg font-semibold tabular-nums" data-testid="reposicion-cantidad">{n}</td>
                  <td className="p-2 text-right">{p.stockQuantity === null ? "Pendiente" : p.stockQuantity}</td>
                  <td className="p-2 text-right">{p.stockQuantity && p.stockQuantity > 0 ? <AdminButton endpoint="/api/admin/reposicion" body={{ productId: p.id }} label={`Avisar a ${n} ${n === 1 ? "persona" : "personas"}`} ok="Avisos encolados." confirmText={`Se enviará un correo a ${n} ${n === 1 ? "persona" : "personas"}. ¿Avisar?`} /> : <span className="text-xs text-ink/55">Cargá stock para poder avisar</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

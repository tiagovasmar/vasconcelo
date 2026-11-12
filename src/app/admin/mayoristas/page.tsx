import Link from "next/link";
import { AdminButton, AdminForm } from "@/components/admin-form";
import { WholesaleExport } from "@/components/wholesale-export";
import { getDb } from "@/db/client";
import { mayorista } from "@/content/politicas";
import { getRules, listTiersForAdmin, missingForOpening } from "@/features/mayorista/precios";
import { listWholesaleRequests } from "@/features/wholesale/service";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

const when = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));
const statusLabel = { pendiente: "Pendiente de revisión", aprobada: "Aprobada", rechazada: "Rechazada" } as const;
const card = "mt-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-5";

/** Aprobación de cuentas y condiciones de apertura del catálogo mayorista. */
export default async function AdminMayoristas() {
  await requireAdmin("/admin/mayoristas");
  const db = getDb();
  const [rows, rules, tiers] = await Promise.all([listWholesaleRequests(db), getRules(db), listTiersForAdmin(db)]);
  const pending = rows.filter((row) => row.status === "pendiente");
  const reviewed = rows.filter((row) => row.status !== "pendiente");
  const published = new Set(tiers.filter((t) => t.state === "publicado").map((t) => t.productId));
  const missing = missingForOpening(rules, published.size);
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Mayoristas</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/admin/precios-mayoristas" className="inline-flex min-h-11 items-center rounded-md bg-emerald px-4 font-bold text-white">Editar precios mayoristas</Link>
        <Link href="/admin/pedidos?tipo=mayorista" className="inline-flex min-h-11 items-center rounded-md border border-ink/25 px-4 font-semibold">Ver pedidos mayoristas</Link>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-ink/75" data-testid="mayoristas-politica">
        La aprobación de cuentas es {mayorista.approval === "manual" ? "manual: la hacés vos" : "automática"}. Los precios dependen de la cantidad y se ven solo en cuentas aprobadas. Es siempre por pedido (el stock minorista no cuenta), con transferencia o efectivo al precio mayorista.
      </p>

      <section className={card} aria-labelledby="apertura-mayorista">
        <h2 id="apertura-mayorista" className="text-base font-semibold">Acceso al catálogo</h2>
        <p className="mt-2 text-sm font-semibold" data-testid="estado-catalogo-mayorista">
          {rules.open && missing.length === 0 ? "Catálogo ABIERTO para cuentas aprobadas." : missing.length ? "Catálogo CERRADO. Hay requisitos pendientes." : "Catálogo CERRADO. Listo para habilitar."}
        </p>
        {missing.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">{missing.map((item) => <li key={item}>{item}</li>)}</ul>}
        <div className="mt-3 flex flex-wrap items-start gap-3">
          {(rules.open || missing.length === 0) && <AdminButton endpoint="/api/admin/mayorista" body={{ action: "catalog_access", open: !rules.open }} label={rules.open ? "Cerrar catálogo mayorista" : "Habilitar catálogo mayorista"} ok={rules.open ? "Catálogo cerrado." : "Catálogo habilitado."} />}
          <Link href="#condiciones-mayoristas" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Editar condiciones</Link>
        </div>
      </section>

      <WholesaleExport includeDrafts />

      <section id="solicitudes" className={`${card} scroll-mt-4`}>
        <h2 className="text-base font-semibold">Solicitudes de cuenta</h2>
        <p role="status" className="mt-1 text-sm text-ink/70" data-testid="mayoristas-cantidad">{rows.length} {rows.length === 1 ? "solicitud" : "solicitudes"}</p>
        <p className="mt-1 text-sm font-semibold text-emerald">{pending.length} {pending.length === 1 ? "pendiente de revisión" : "pendientes de revisión"}</p>
        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70">Todavía no hay solicitudes.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {[...pending, ...reviewed].map((r) => (
              <li key={r.reference} id={r.reference} className="scroll-mt-4 rounded-xl border border-ink/15 p-4 text-sm" data-testid="mayorista-fila">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <b className="text-base">{r.businessName}</b>
                  <span className="rounded-full border border-ink/30 px-3 py-0.5 text-xs font-semibold">{statusLabel[r.status]}</span>
                </div>
                <p className="mt-1 break-words text-ink/75">{r.name} · {r.email} · {r.locality}, {r.province}</p>
                {r.note && <p className="mt-2 whitespace-pre-wrap border-l-4 border-emerald pl-3">{r.note}</p>}
                <p className="mt-2 text-xs text-ink/75">{r.reference} · solicitada el {when(r.createdAt)}{r.reviewedAt ? ` · revisada el ${when(r.reviewedAt)}${r.reviewedByEmail ? ` por ${r.reviewedByEmail}` : ""}` : ""}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.status !== "aprobada" && <AdminButton endpoint={`/api/admin/mayoristas/${r.reference}`} method="PATCH" body={{ status: "aprobada" }} label="Aprobar cuenta" ok="Cuenta aprobada." confirmText={`¿Aprobar la cuenta de ${r.businessName}? Va a ver los precios mayoristas cuando el catálogo esté abierto.`} />}
                  {r.status !== "rechazada" && <AdminButton endpoint={`/api/admin/mayoristas/${r.reference}`} method="PATCH" body={{ status: "rechazada" }} label={r.status === "aprobada" ? "Revocar aprobación" : "Rechazar"} ok="Listo." danger confirmText="¿Seguro? La persona deja de ver precios mayoristas." />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="condiciones-mayoristas" className={`${card} scroll-mt-4`} data-testid="reglas-mayoristas">
        <h2 className="text-base font-semibold">Condiciones comerciales</h2>
        <p className="mt-1 text-xs text-ink/70">Para abrir el catálogo, definí la compra mínima, la combinación de productos, la demora y desde cuándo se cuenta, el plazo de reintegro y las condiciones de cancelación. También hace falta publicar al menos un tramo. La demora se informa antes de pagar la seña, indicando desde qué momento se cuenta; no se prometen fechas.</p>
        <div className="mt-3">
          <AdminForm endpoint="/api/admin/mayorista" idempotent={false} resetAfterSave={false} fixed={{ action: "rules" }} fields={[
            { name: "minBoxes", label: "Compra mínima (cajas)", type: "int", defaultValue: String(rules.minBoxes ?? 2), help: "Cuenta únicamente cajas del catálogo." },
            { name: "minUnits", label: "Compra mínima (unidades)", type: "int", defaultValue: rules.minUnits === null ? "" : String(rules.minUnits), help: "Vacío = sin mínimo en unidades." },
            { name: "minAmountMinor", label: "Compra mínima (pesos)", type: "pesos", defaultValue: rules.minAmountMinor === null ? "" : String(rules.minAmountMinor / 100), help: "Vacío = sin mínimo en pesos. Hace falta definir al menos uno." },
            { name: "combine", label: "¿Se combinan productos?", type: "select", defaultValue: rules.combine ?? "", options: [{ value: "producto", label: "No: cada producto llega a su propio tramo" }, { value: "pedido", label: "Sí: las unidades de todo el pedido suman para el tramo y el mínimo" }] },
            { name: "delayText", label: "Demora estimada", defaultValue: rules.delayText ?? "Entre 8 y 15 días", help: "Texto, sin fechas garantizadas. Ej.: «entre X y Y semanas»." },
            { name: "delayFrom", label: "Se cuenta desde…", defaultValue: rules.delayFrom ?? "La confirmación de la seña" },
            { name: "refundPeriod", label: "Plazo de reintegro de la seña", type: "textarea", maxLength: 500, defaultValue: rules.refundPeriod ?? "", help: "Dejar vacío hasta definirlo. Se reintegra la seña si el paquete se pierde o no se puede cumplir el pedido." },
            { name: "cancellationPolicy", label: "Condiciones de cancelación voluntaria", type: "textarea", defaultValue: rules.cancellationPolicy ?? mayorista.cancellationPolicy, help: "La cancelación voluntaria se distingue del reintegro por pérdida o incumplimiento." },
          ]} submit="Guardar condiciones" ok="Condiciones guardadas." testId="form-reglas" />
        </div>
      </section>

    </div>
  );
}

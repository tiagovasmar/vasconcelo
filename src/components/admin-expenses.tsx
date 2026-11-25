import { AdminForm, type FormField } from "@/components/admin-form";
import type { accountingOverview } from "@/features/contabilidad/service";
import { formatARS } from "@/lib/format";

const endpoint = "/api/admin/contabilidad/gastos";
const date = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
const expenseFields: FormField[] = [
  { name: "spentAt", label: "Fecha del gasto", type: "date", required: true },
  { name: "amountMinor", label: "Importe del gasto (ARS)", type: "pesos", required: true },
  { name: "description", label: "Concepto", maxLength: 300, required: true },
];
const payment: FormField = {
  name: "paymentMethod", label: "Medio de pago", type: "select", required: true, options: [
    { value: "efectivo", label: "Efectivo" }, { value: "transferencia", label: "Transferencia" },
    { value: "tarjeta", label: "Tarjeta" }, { value: "otro", label: "Otro" },
  ],
};
type Expenses = Pick<Awaited<ReturnType<typeof accountingOverview>>, "expenses" | "pendingExpenses" | "pendingSpent">;

export function AdminExpenses({ expenses, pendingExpenses, pendingSpent, filtered }: Expenses & { filtered: boolean }) {
  return (
    <section id="gastos" className="mt-10 grid scroll-mt-4 gap-6 border-t border-ink/20 pt-6 lg:grid-cols-2" aria-labelledby="gastos-title">
      <div id="por-pagar" className="min-w-0 scroll-mt-4 rounded-lg border border-ink/15 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="gastos-title" className="text-lg font-semibold">Gastos por pagar</h2>
          <b data-testid="gastos-por-pagar-total">{formatARS(pendingSpent)}</b>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold underline">Anotar un gasto pendiente</summary>
          <div className="mt-3">
            <AdminForm endpoint={endpoint} fixed={{ pending: true }} submit="Guardar gasto pendiente" ok="Gasto pendiente registrado." fields={expenseFields} testId="gasto-pendiente" />
          </div>
        </details>
        {pendingExpenses.length ? <ul className="mt-3 divide-y divide-ink/10">
          {pendingExpenses.map((expense) => (
            <li key={expense.id} className="py-3 text-sm" data-testid={`gasto-por-pagar-${expense.id}`}>
              <div className="flex flex-wrap justify-between gap-2">
                <p className="min-w-0 break-words font-semibold">{expense.description}</p>
                <b>{formatARS(expense.amountMinor)}</b>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold underline">Marcar como pagado</summary>
                <div className="mt-3">
                  <AdminForm endpoint={endpoint} method="PATCH" idempotent={false} fixed={{ expenseId: expense.id }}
                    fields={[{ name: "paidAt", label: "Fecha de pago", type: "date", required: true }, payment]}
                    submit="Confirmar pago" ok="Gasto pagado." />
                </div>
              </details>
            </li>
          ))}
        </ul> : <p className="mt-3 text-sm text-ink/75">No hay gastos pendientes.</p>}
      </div>

      <div className="min-w-0 rounded-lg border border-ink/15 bg-white p-4">
        <h2 className="text-lg font-semibold">{filtered ? "Gastos pagados del período" : "Últimos gastos pagados"}</h2>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold underline">Registrar un gasto ya pagado</summary>
          <div className="mt-3">
            <AdminForm endpoint={endpoint} submit="Guardar gasto" ok="Gasto registrado."
              fields={[{ ...expenseFields[0], label: "Fecha de pago" }, ...expenseFields.slice(1), payment]} />
          </div>
        </details>
        {expenses.length ? <ul className="mt-3 divide-y divide-ink/10">
          {expenses.map((expense) => (
            <li key={expense.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p className="break-words font-semibold">{expense.description}</p>
                <p className="text-ink/70">{date.format(expense.paidAt ?? expense.spentAt)} · {payment.options?.find((option) => option.value === expense.paymentMethod)?.label ?? expense.paymentMethod}</p>
              </div>
              <b>{formatARS(expense.amountMinor)}</b>
            </li>
          ))}
        </ul> : <p className="mt-3 text-sm text-ink/75">No hay gastos pagados en esta vista.</p>}
      </div>
    </section>
  );
}

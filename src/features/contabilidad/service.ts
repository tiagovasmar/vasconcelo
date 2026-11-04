import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { accountingExpenses, sales, storefrontVisits } from "@/db/schema";
import { accountingDateFilter, accountingDay, saleAccountingDay, type AccountingPeriod } from "./period";
import { SaleError } from "@/features/sales/errors";

const ExpenseInput = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  spentAt: z.number().int().min(0).max(8_640_000_000_000_000),
  amountMinor: z.number().int().positive().max(100_000_000_000),
  description: z.string().trim().min(1).max(300),
  paymentMethod: z.enum(["efectivo", "transferencia", "tarjeta", "otro"]),
});

export async function registerExpense(db: Db, body: unknown, email: string) {
  const parsed = ExpenseInput.safeParse(body);
  if (!parsed.success) throw new SaleError(400, "invalid_input", "Revisá la fecha, el importe, el concepto y el medio de pago del gasto.");
  const { idempotencyKey: id, ...data } = parsed.data;
  const [inserted] = await db.insert(accountingExpenses).values({ id, ...data, createdAt: Date.now(), createdByEmail: email }).onConflictDoNothing().returning();
  if (inserted) return { replayed: false };
  const [existing] = await db.select().from(accountingExpenses).where(eq(accountingExpenses.id, id));
  if (!existing || existing.createdByEmail !== email || existing.spentAt !== data.spentAt || existing.amountMinor !== data.amountMinor || existing.description !== data.description || existing.paymentMethod !== data.paymentMethod) {
    throw new SaleError(422, "idempotency_conflict", "Esa operación ya corresponde a otro gasto.");
  }
  return { replayed: true };
}

export async function accountingOverview(db: Db, period: AccountingPeriod = {}) {
  const expenseFilter = accountingDateFilter(accountingDay(sql`${accountingExpenses.spentAt}`), period);
  const [expenses, [salesTotals], [expenseTotals], billing, visits] = await Promise.all([
    db.select().from(accountingExpenses).where(expenseFilter).orderBy(desc(accountingExpenses.spentAt), desc(accountingExpenses.createdAt)).limit(30),
    db.select({
      gross: sql<string>`coalesce(sum(${sales.totalMinor}), 0)`,
      net: sql<string>`coalesce(sum(case when ${sales.paymentMethod} like 'tarjeta%' then ${sales.receivedMinor} else ${sales.totalMinor} end), 0)`,
      pending: sql<string>`count(*) filter (where ${sales.paymentMethod} like 'tarjeta%' and ${sales.receivedMinor} is null)`,
    }).from(sales).where(and(eq(sales.status, "registrada"), accountingDateFilter(saleAccountingDay, period))),
    db.select({ total: sql<string>`coalesce(sum(${accountingExpenses.amountMinor}), 0)` }).from(accountingExpenses).where(expenseFilter),
    db.select({ day: sql<string>`${saleAccountingDay}::text`, total: sql<string>`sum(${sales.totalMinor})` })
      .from(sales).where(and(eq(sales.status, "registrada"), accountingDateFilter(saleAccountingDay, period)))
      .groupBy(saleAccountingDay).orderBy(saleAccountingDay),
    db.select({ day: storefrontVisits.day, total: sql<string>`count(*)` })
      .from(storefrontVisits).where(accountingDateFilter(sql`${storefrontVisits.day}::date`, period))
      .groupBy(storefrontVisits.day).orderBy(storefrontVisits.day),
  ]);
  return { expenses, billing: billing.map((row) => ({ day: row.day, total: Number(row.total) })), visits: visits.map((row) => ({ day: row.day, total: Number(row.total) })), gross: Number(salesTotals.gross), net: Number(salesTotals.net), pending: Number(salesTotals.pending), spent: Number(expenseTotals.total) };
}

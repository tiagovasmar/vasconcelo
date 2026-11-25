import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import type { Tx } from "@/db/lock";
import { accountingExpenses, sales, storefrontVisits } from "@/db/schema";
import { accountingDateFilter, accountingDay, saleAccountingDay, type AccountingPeriod } from "./period";
import { SaleError } from "@/features/sales/errors";

const ExpenseId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
const ExpenseDate = z.number().int().min(0).max(8_640_000_000_000_000);
const ExpenseMethod = z.enum(["efectivo", "transferencia", "tarjeta", "otro"]);
const ExpenseInput = z.object({
  idempotencyKey: ExpenseId,
  spentAt: ExpenseDate,
  amountMinor: z.number().int().positive().max(100_000_000_000),
  description: z.string().trim().min(1).max(300),
  paymentMethod: ExpenseMethod.optional(),
  pending: z.boolean().default(false),
}).refine((e) => e.pending || Boolean(e.paymentMethod));

export async function registerExpense(db: Db | Tx, body: unknown, email: string) {
  const parsed = ExpenseInput.safeParse(body);
  if (!parsed.success) throw new SaleError(400, "invalid_input", "Revisá la fecha, el importe, el concepto y el medio de pago del gasto.");
  const { idempotencyKey: id, pending, ...data } = parsed.data;
  const paymentMethod = pending ? "pendiente" : data.paymentMethod!;
  const [inserted] = await db.insert(accountingExpenses).values({ id, ...data, paymentMethod, createdAt: Date.now(), createdByEmail: email }).onConflictDoNothing().returning();
  if (inserted) return { replayed: false };
  const [existing] = await db.select().from(accountingExpenses).where(eq(accountingExpenses.id, id));
  const originallyPending = existing && (existing.paymentMethod === "pendiente" || existing.paidAt !== null);
  if (!existing || existing.createdByEmail !== email || existing.spentAt !== data.spentAt || existing.amountMinor !== data.amountMinor || existing.description !== data.description || originallyPending !== pending || (!pending && existing.paymentMethod !== paymentMethod)) {
    throw new SaleError(422, "idempotency_conflict", "Esa operación ya corresponde a otro gasto.");
  }
  return { replayed: true };
}

export async function markExpensePaid(db: Db, body: unknown) {
  const parsed = z.object({ expenseId: ExpenseId, paidAt: ExpenseDate, paymentMethod: ExpenseMethod }).safeParse(body);
  if (!parsed.success) throw new SaleError(400, "invalid_input", "Revisá la fecha y el medio de pago.");
  const { expenseId, paidAt, paymentMethod } = parsed.data;
  const [updated] = await db.update(accountingExpenses).set({ paidAt, paymentMethod })
    .where(and(eq(accountingExpenses.id, expenseId), eq(accountingExpenses.paymentMethod, "pendiente")))
    .returning({ id: accountingExpenses.id });
  if (updated) return { replayed: false };
  const [existing] = await db.select({ paidAt: accountingExpenses.paidAt, paymentMethod: accountingExpenses.paymentMethod })
    .from(accountingExpenses).where(eq(accountingExpenses.id, expenseId));
  if (!existing) throw new SaleError(404, "not_found", "El gasto no existe.");
  if (existing.paidAt === paidAt && existing.paymentMethod === paymentMethod) return { replayed: true };
  throw new SaleError(409, "order_rule", "El gasto ya está registrado como pagado.");
}

export async function accountingOverview(db: Db, period: AccountingPeriod = {}) {
  const paymentAt = sql`coalesce(${accountingExpenses.paidAt}, ${accountingExpenses.spentAt})`;
  const expenseFilter = and(ne(accountingExpenses.paymentMethod, "pendiente"), accountingDateFilter(accountingDay(paymentAt), period));
  const [expenses, pendingExpenses, [salesTotals], [expenseTotals], billing, visits] = await Promise.all([
    db.select().from(accountingExpenses).where(expenseFilter).orderBy(desc(paymentAt), desc(accountingExpenses.createdAt)).limit(30),
    db.select().from(accountingExpenses).where(eq(accountingExpenses.paymentMethod, "pendiente")).orderBy(desc(accountingExpenses.spentAt), desc(accountingExpenses.createdAt)),
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
  return { expenses, pendingExpenses, pendingSpent: pendingExpenses.reduce((sum, expense) => sum + expense.amountMinor, 0), billing: billing.map((row) => ({ day: row.day, total: Number(row.total) })), visits: visits.map((row) => ({ day: row.day, total: Number(row.total) })), gross: Number(salesTotals.gross), net: Number(salesTotals.net), pending: Number(salesTotals.pending), spent: Number(expenseTotals.total) };
}

export async function reservedSalesToCollect(db: Db) {
  return db.select({
    id: sales.id,
    customer: sales.customerContact,
    scheduledFor: sales.scheduledFor,
    totalMinor: sales.totalMinor,
    totalUsdMinor: sales.totalUsdMinor,
    stockFromImport: sales.stockFromImport,
  }).from(sales)
    .where(and(eq(sales.status, "agendada"), sql`${sales.totalMinor} > 0`))
    .orderBy(sales.scheduledFor, desc(sales.createdAt), sales.id);
}

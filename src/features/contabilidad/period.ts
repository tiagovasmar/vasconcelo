import { and, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { sales } from "@/db/schema";

export type AccountingPeriod = { from?: string; to?: string };

export function currentAccountingMonth(now = new Date()) {
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(now).slice(0, 7);
  const from = `${month}-01`;
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { month, period: { from, to: end.toISOString().slice(0, 10) } };
}

export function parseAccountingPeriod(from: unknown, to: unknown) {
  const date = z.iso.date();
  const start = date.safeParse(from || undefined);
  const end = date.safeParse(to || undefined);
  if ((from && !start.success) || (to && !end.success)) return { error: "Ingresá fechas válidas.", period: {} as AccountingPeriod };
  const period = { from: start.data, to: end.data };
  if (period.from && period.to && period.from > period.to) return { error: "La fecha Desde debe ser anterior o igual a Hasta.", period: {} as AccountingPeriod };
  return { error: null, period };
}

export const accountingDay = (timestamp: SQL) =>
  sql`(to_timestamp(${timestamp} / 1000.0) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;

export const saleAccountingDay = sql`coalesce(${sales.soldOn}::date, ${accountingDay(sql`${sales.createdAt}`)})`;

export function accountingDateFilter(day: SQL, period: AccountingPeriod) {
  return and(
    period.from ? sql`${day} >= ${period.from}::date` : undefined,
    period.to ? sql`${day} <= ${period.to}::date` : undefined,
  );
}

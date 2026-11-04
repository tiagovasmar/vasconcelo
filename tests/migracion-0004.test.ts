import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { createDatabaseFromTemplate, dropDatabase, urlWithDatabase } from "../scripts/lib/test-postgres";

/**
 * Ensayo de la migración 0004 sobre una base DESCARTABLE que ya tiene datos de la 0003 (como producción): se aplican las migraciones hasta la 0003, se cargan filas de
 * consultas, líneas, ventas y stock, se aplica la 0004 y se verifica que no se perdió ni cambió nada y que lo nuevo nace vacío y con valores por defecto.
 * Nunca toca una base real: usa el PostgreSQL de pruebas.
 */
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

describe("migración 0004 sobre datos existentes", () => {
  it("es aditiva: conserva todas las filas, agrega las tablas y la columna con su valor por defecto", async () => {
    const admin = process.env.TEST_PG_ADMIN_URL!;
    // Base vacía (sin migrar): se crea desde cero con el servidor de pruebas.
    const name = `m4_${randomBytes(5).toString("hex")}`;
    const adminDb = createDb(admin, { max: 1 });
    await adminDb.execute(sql.raw(`create database ${name}`));
    await adminDb.$client.end({ timeout: 5 });
    const url = urlWithDatabase(admin, name);
    // Carpeta con migraciones SOLO hasta la 0003.
    const full = path.resolve("drizzle");
    const part = fs.mkdtempSync(path.join(os.tmpdir(), "mig-parcial-"));
    dirs.push(part);
    fs.mkdirSync(path.join(part, "meta"));
    const journal = JSON.parse(fs.readFileSync(path.join(full, "meta", "_journal.json"), "utf8")) as { entries: Array<{ tag: string }> };
    const upTo3 = { ...journal, entries: journal.entries.filter((e) => e.tag < "0004") };
    expect(upTo3.entries.length).toBe(4);
    fs.writeFileSync(path.join(part, "meta", "_journal.json"), JSON.stringify(upTo3));
    for (const e of upTo3.entries) fs.copyFileSync(path.join(full, `${e.tag}.sql`), path.join(part, `${e.tag}.sql`));
    const db = createDb(url, { max: 1 });
    try {
      await migrate(db, { migrationsFolder: part });
      await db.execute(sql`insert into inquiries (id, idempotency_key, content_hash, session_token_hash, status, currency, subtotal_minor, delivery_method, delivery_json, payment_preference, message, created_at) values ('TT-MIGRA001','k-mig-0000000001','h','s','consulta_preparada','ARS',123400,'retiro','{}','efectivo','mensaje',1700000000000)`);
      await db.execute(sql`insert into inquiry_lines (inquiry_id, product_id, sku, title, language, quantity, fulfillment, unit_price_minor, line_subtotal_minor) values ('TT-MIGRA001','storm-sobre','SKU-1','Sobre','ja',2,'stock',61700,123400)`);
      await db.execute(sql`insert into product_overrides (product_id, stock_quantity, order_only, visible, updated_at, updated_by_email) values ('storm-sobre', 7, false, true, 1, 'dueno@example.com')`);
      const before = (await db.execute(sql`select count(*)::int as n from inquiries`)) as unknown as Array<{ n: number }>;
      expect(before[0].n).toBe(1);
      // Se aplica la 0004 con la carpeta completa (la misma que se aplicaría en producción).
      await migrate(db, { migrationsFolder: full });
      const inq = (await db.execute(sql`select id, subtotal_minor, order_kind from inquiries`)) as unknown as Array<{ id: string; subtotal_minor: string; order_kind: string }>;
      expect(inq).toEqual([{ id: "TT-MIGRA001", subtotal_minor: "123400", order_kind: "minorista" }]);
      expect(((await db.execute(sql`select quantity, line_subtotal_minor from inquiry_lines`)) as unknown as Array<{ quantity: number }>)[0].quantity).toBe(2);
      expect(((await db.execute(sql`select stock_quantity from product_overrides`)) as unknown as Array<{ stock_quantity: number }>)[0].stock_quantity).toBe(7);
      const created = (await db.execute(sql`select table_name from information_schema.tables where table_schema='public' and table_name in ('order_tracks','order_payments','payment_receipts','shipments','restock_alerts','cost_purchases','wholesale_tiers','notification_outbox','applied_costs') order by 1`)) as unknown as Array<{ table_name: string }>;
      expect(created).toHaveLength(9);
      for (const t of ["order_tracks", "order_payments", "restock_alerts", "applied_costs", "wholesale_tiers"]) expect(((await db.execute(sql.raw(`select count(*)::int as n from ${t}`))) as unknown as Array<{ n: number }>)[0].n).toBe(0);
      // Volver a aplicar no hace nada (idempotente).
      await migrate(db, { migrationsFolder: full });
      expect(((await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)) as unknown as Array<{ n: number }>)[0].n).toBe(journal.entries.length);
    } finally {
      await db.$client.end({ timeout: 5 });
      const a2 = createDb(admin, { max: 1 });
      await a2.execute(sql.raw(`drop database if exists ${name} with (force)`)).catch(() => undefined);
      await a2.$client.end({ timeout: 5 });
      void createDatabaseFromTemplate;
      void dropDatabase;
    }
  });
});

import net from "node:net";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { backoffSeconds, DbTimeoutError } from "@/db/resilient";
import { createDatabaseFromTemplate, dropDatabase, urlWithDatabase } from "../scripts/lib/test-postgres";

/**
 * La base de datos que falla, se cuelga o vuelve. Todo contra un PostgreSQL REAL descartable (el de Vitest), con un proxy TCP propio delante para poder
 * «apagar» la base, dejarla muda o devolverla sin reiniciar la aplicación. Antes de esta corrección, con la base caída las solicitudes siguientes esperaban hasta
 * 20 s cada una (la espera entre intentos de `postgres.js` crece 3× por fallo y se comparte), y una base muda dejaba la consulta pendiente sin límite.
 */
type Mode = "forward" | "stall" | "down";
class TcpProxy {
  mode: Mode = "forward";
  private server: net.Server | null = null;
  private sockets = new Set<net.Socket>();
  constructor(readonly port: number, private target: { host: string; port: number }) {}
  async up() {
    this.server = net.createServer((client) => {
      this.sockets.add(client);
      const upstream = net.connect(this.target.port, this.target.host);
      this.sockets.add(upstream);
      const pipe = (from: net.Socket, to: net.Socket) => from.on("data", (d) => { if (this.mode === "forward") to.write(d); });
      pipe(client, upstream);
      pipe(upstream, client);
      for (const s of [client, upstream]) {
        s.on("error", () => undefined);
        s.on("close", () => { this.sockets.delete(s); client.destroy(); upstream.destroy(); });
      }
    });
    await new Promise<void>((r) => this.server!.listen(this.port, "127.0.0.1", r));
  }
  /** Base «caída»: no acepta conexiones y corta las existentes. */
  async down() {
    this.mode = "down";
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
    this.server = null;
  }
  async recover() {
    this.mode = "forward";
    if (!this.server) await this.up();
  }
}

const free = () => new Promise<number>((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const ms = async <T,>(fn: () => Promise<T>) => {
  const t = Date.now();
  let error: unknown;
  let value: T | undefined;
  try { value = await fn(); } catch (e) { error = e; }
  return { took: Date.now() - t, error, value };
};
const causa = (e: unknown) => (e as { cause?: unknown })?.cause ?? e;
const codeOf = (e: unknown) => (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
const count = async (adminSql: postgres.Sql, q: Promise<unknown>) => ((await q) as Array<{ n: number }>)[0].n;

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c().catch(() => undefined); });

async function setup(limits: { queryTimeoutMs: number; connectTimeoutS?: number; graceMs?: number }) {
  const admin = process.env.TEST_PG_ADMIN_URL!;
  const name = `r_${Math.random().toString(16).slice(2, 10)}`;
  await createDatabaseFromTemplate(admin, name);
  const direct = urlWithDatabase(admin, name);
  const u = new URL(direct);
  const proxy = new TcpProxy(await free(), { host: u.hostname, port: Number(u.port) });
  await proxy.up();
  const viaProxy = new URL(direct);
  viaProxy.port = String(proxy.port);
  const db = createDb(viaProxy.toString(), { max: 1, connectTimeoutS: limits.connectTimeoutS ?? 2, queryTimeoutMs: limits.queryTimeoutMs, graceMs: limits.graceMs ?? 800 });
  const adminSql = postgres(direct, { max: 1, onnotice: () => undefined });
  cleanups.push(async () => {
    await db.$client.end({ timeout: 0 });
    await adminSql.end({ timeout: 1 });
    await proxy.down();
    await dropDatabase(admin, name);
  });
  return { db, proxy, adminSql };
}

describe("base de datos caída o muda", () => {
  it("la espera entre intentos está acotada (antes llegaba a 20 s)", () => {
    for (let n = 0; n < 40; n++) expect(backoffSeconds(n)).toBeLessThanOrEqual(1);
    expect(backoffSeconds(0)).toBeLessThan(0.11);
  });

  it("con la base caída cada solicitud falla rápido con un error controlado y las esperas no se acumulan; al volver la base se recupera sin reiniciar", async () => {
    const { db, proxy } = await setup({ queryTimeoutMs: 3000 });
    expect((await ms(() => db.execute(sql`select 1`))).error).toBeUndefined();
    await proxy.down();
    // Solicitudes CONCURRENTES, como las de una página que pide varias cosas: todas deben terminar en pocos segundos en total.
    const t0 = Date.now();
    const lote = await Promise.all(Array.from({ length: 8 }, () => ms(() => db.execute(sql`select 1`))));
    expect(Date.now() - t0).toBeLessThan(6000);
    for (const r of lote) expect(r.error).toBeDefined();
    // Y varias rondas seguidas: la espera no crece.
    const t1 = Date.now();
    for (let i = 0; i < 10; i++) {
      const r = await ms(() => db.execute(sql`select 1`));
      expect(r.error).toBeDefined();
      expect(r.took).toBeLessThan(3500);
    }
    expect(Date.now() - t1).toBeLessThan(15_000); // con la espera original (3^n/100 s) estas 10 rondas sumaban más de 8 minutos
    await proxy.recover();
    const vuelta = await ms(async () => {
      for (let i = 0; i < 20; i++) {
        try { return await db.execute(sql`select 1 as ok`); } catch { await new Promise((r) => setTimeout(r, 250)); }
      }
      throw new Error("no se recuperó");
    });
    expect(vuelta.error).toBeUndefined();
    expect(vuelta.took).toBeLessThan(5000);
  }, 60_000);

  it("una base que acepta la conexión y no contesta: se corta por plazo con DbTimeoutError, se descarta la conexión y la siguiente solicitud usa una nueva", async () => {
    const { db, proxy, adminSql } = await setup({ queryTimeoutMs: 1000, graceMs: 800 });
    await db.execute(sql`select 1`); // conexión abierta y sana
    proxy.mode = "stall"; // deja de reenviar: ni la consulta ni la cancelación llegan
    const r = await ms(() => db.execute(sql`select 2`));
    expect(causa(r.error)).toBeInstanceOf(DbTimeoutError); // drizzle envuelve el error original en `cause`
    expect(r.took).toBeGreaterThanOrEqual(1000);
    expect(r.took).toBeLessThan(4000);
    proxy.mode = "forward";
    expect((await ms(() => db.execute(sql`select 3 as n`))).error).toBeUndefined();
    // No quedó ninguna sesión bloqueada de la conexión descartada: solo la nueva.
    await new Promise((res) => setTimeout(res, 500));
    expect(await count(adminSql, adminSql`select count(*)::int as n from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()`)).toBeLessThanOrEqual(1);
  }, 30_000);
});

describe("consultas lentas y transacciones", () => {
  it("una consulta que tarda demasiado se CANCELA en el servidor (no sigue ejecutándose) y la conexión sigue sirviendo", async () => {
    const { db, adminSql } = await setup({ queryTimeoutMs: 1000 });
    const r = await ms(() => db.execute(sql`select pg_sleep(30)`));
    expect(r.error).toBeDefined();
    expect(r.took).toBeLessThan(3500);
    expect(codeOf(r.error) === "57014" || causa(r.error) instanceof DbTimeoutError || /cancel/i.test(String((r.error as Error).message))).toBe(true);
    await new Promise((res) => setTimeout(res, 400));
    expect(await count(adminSql, adminSql`select count(*)::int as n from pg_stat_activity where datname = current_database() and query like '%pg_sleep(30)%' and state = 'active' and pid <> pg_backend_pid()`)).toBe(0);
    expect((await ms(() => db.execute(sql`select 1`))).error).toBeUndefined();
  }, 30_000);

  it("una transacción que vence se revierte entera: no queda nada a medias y NO se reintenta sola", async () => {
    const { db, adminSql } = await setup({ queryTimeoutMs: 1000 });
    await adminSql`create table prueba_tx (a int)`;
    let intentos = 0;
    const r = await ms(() => db.transaction(async (tx) => {
      intentos++;
      await tx.execute(sql`insert into prueba_tx values (1)`);
      await tx.execute(sql`select pg_sleep(30)`);
    }));
    expect(r.error).toBeDefined();
    expect(intentos).toBe(1);
    await new Promise((res) => setTimeout(res, 400));
    expect(await count(adminSql, adminSql`select count(*)::int as n from prueba_tx`)).toBe(0);
  }, 30_000);

  it("una transacción normal confirma igual que antes", async () => {
    const { db, adminSql } = await setup({ queryTimeoutMs: 5000 });
    await adminSql`create table prueba_ok (a int)`;
    await db.transaction(async (tx) => { await tx.execute(sql`insert into prueba_ok values (1), (2)`); });
    expect(await count(adminSql, adminSql`select count(*)::int as n from prueba_ok`)).toBe(2);
  }, 30_000);

  it("sin plazo configurado (migraciones, respaldos, herramientas) no se cancela nada", async () => {
    const { db } = await setup({ queryTimeoutMs: 0 });
    expect((await ms(() => db.execute(sql`select pg_sleep(1.5), 1 as n`))).error).toBeUndefined();
  }, 30_000);
});

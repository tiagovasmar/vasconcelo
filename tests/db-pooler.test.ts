import { afterEach, describe, expect, it } from "vitest";
import { databaseUrl } from "@/db/client";

const original = process.env.DATABASE_URL;
afterEach(() => { process.env.DATABASE_URL = original; });
const withUrl = (url: string) => { process.env.DATABASE_URL = url; return databaseUrl(); };

describe("databaseUrl: pooler compartido de Supabase", () => {
  it("pasa del modo sesión (5432 o sin puerto) al modo transacción (6543), conservando usuario y destino", () => {
    expect(new URL(withUrl("postgres://u.proj:clave@aws-0-us-east-1.pooler.supabase.com:5432/postgres")).port).toBe("6543");
    const sinPuerto = new URL(withUrl("postgres://u.proj:clave@aws-0-us-east-1.pooler.supabase.com/postgres"));
    expect(sinPuerto.port).toBe("6543");
    expect(sinPuerto.username).toBe("u.proj");
    expect(sinPuerto.pathname).toBe("/postgres");
  });
  it("no toca una URL que ya usa 6543 ni una base local o directa", () => {
    const t = "postgres://u.proj:clave@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
    expect(withUrl(t)).toBe(t);
    expect(withUrl("postgres://postgres:postgres@127.0.0.1:54400/vasconcelo_dev")).toBe("postgres://postgres:postgres@127.0.0.1:54400/vasconcelo_dev");
    expect(withUrl("postgres://postgres:clave@db.abc.supabase.co:5432/postgres")).toBe("postgres://postgres:clave@db.abc.supabase.co:5432/postgres");
  });
});

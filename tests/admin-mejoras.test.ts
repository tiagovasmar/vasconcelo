import { beforeEach, describe, expect, it } from "vitest";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { getLowStock, isLowStock, LOW_STOCK_DEFAULT, LowStockInputSchema, setLowStock } from "@/features/admin/settings";

let db: Db;
beforeEach(async () => { db = await openTestDb(); });

describe("aviso de stock bajo configurable", () => {
  it("sin configurar rige el valor inicial sugerido; al guardar queda persistente con quién y cuándo", async () => {
    expect(await getLowStock(db)).toEqual({ threshold: LOW_STOCK_DEFAULT, custom: false, updatedAt: null, updatedByEmail: null });
    await setLowStock(db, 5, { email: "dueno@example.com" }, 1_000);
    expect(await getLowStock(db)).toEqual({ threshold: 5, custom: true, updatedAt: 1_000, updatedByEmail: "dueno@example.com" });
    await setLowStock(db, 0, { email: "dueno@example.com" }, 2_000); // 0 = sin aviso (se distingue de «sin configurar»)
    expect(await getLowStock(db)).toMatchObject({ threshold: 0, custom: true, updatedAt: 2_000 });
  });

  it("valida el umbral: entero entre 0 y 999", async () => {
    for (const bad of [-1, 1.5, 1000, Number.NaN, "3" as unknown as number]) expect(LowStockInputSchema.safeParse({ lowStockThreshold: bad }).success, String(bad)).toBe(false);
    await expect(setLowStock(db, -2, { email: "x@y.z" })).rejects.toThrow();
    expect((await getLowStock(db)).custom).toBe(false); // lo inválido no se guarda
    expect(LowStockInputSchema.safeParse({ lowStockThreshold: 0 }).success).toBe(true);
    expect(LowStockInputSchema.safeParse({ lowStockThreshold: 999 }).success).toBe(true);
  });

  it("«bajo» es entre 1 y N unidades: 0 es «sin stock», desconocido y por encargo no cuentan, y 0 desactiva el aviso", async () => {
    expect(isLowStock(1, false, 3)).toBe(true);
    expect(isLowStock(3, false, 3)).toBe(true);
    expect(isLowStock(4, false, 3)).toBe(false);
    expect(isLowStock(0, false, 3)).toBe(false);
    expect(isLowStock(null, false, 3)).toBe(false);
    expect(isLowStock(2, true, 3)).toBe(false);
    expect(isLowStock(2, false, 0)).toBe(false);
  });
});

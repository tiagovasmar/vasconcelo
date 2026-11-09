import { beforeEach, expect, it, vi } from "vitest";
import { baseTier, exportDate, exportPages } from "@/features/mayorista/export-image";
import type { WholesaleRow } from "@/features/mayorista/calc";
import { catalogPdf } from "@/features/mayorista/export-pdf";
import { PDFDocument } from "pdf-lib";

const state = vi.hoisted(() => ({ user: null as null | { id: string }, allowed: false, price: 11000 }));
vi.mock("@/server/session", () => ({ userFromRequest: async () => state.user }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/features/mayorista/precios", () => ({
  wholesaleAccess: async () => ({ ok: state.allowed }),
  wholesaleCatalog: async () => ({ rows: [{ productId: "caja", tiers: [{ minQty: 2, unitUsdMinor: state.price }] }, { productId: "sin-precio", tiers: [] }, { productId: "cero", tiers: [{ minQty: 1, unitUsdMinor: 0 }] }], rules: { minBoxes: 3 }, fx: { rate10k: null, status: "expired" } }),
}));
import { GET } from "@/app/api/mayoristas/exportar/route";

beforeEach(() => { state.user = null; state.allowed = false; state.price = 11000; });
it("protege los precios ante visitantes y cuentas sin aprobación", async () => {
  expect((await GET(new Request("http://localhost/api/mayoristas/exportar"))).status).toBe(401);
  state.user = { id: "cliente" };
  expect((await GET(new Request("http://localhost/api/mayoristas/exportar"))).status).toBe(403);
});
it("consulta el precio de nuevo en cada generación, sin caché ni costos privados", async () => {
  state.user = { id: "cliente" }; state.allowed = true;
  const first = await GET(new Request("http://localhost/api/mayoristas/exportar"));
  expect(first.headers.get("cache-control")).toBe("no-store");
  expect((await first.json()).rows[0].tiers[0].unitUsdMinor).toBe(11000);
  state.price = 11500;
  const data = await (await GET(new Request("http://localhost/api/mayoristas/exportar"))).json();
  expect(data.rows[0].tiers[0].unitUsdMinor).toBe(11500);
  expect(data.generatedAt).toBeGreaterThan(0);
  expect(data).not.toHaveProperty("costs");
  expect(data.fx.rate10k).toBeNull();
  expect(data.rows).toHaveLength(1);
  expect(data.minBoxes).toBe(3);
});
it("usa el primer tramo por cantidad aunque los tramos estén desordenados", () => {
  const row = { tiers: [{ minQty: 12, unitUsdMinor: 8000 }, { minQty: 2, unitUsdMinor: 11000 }] } as WholesaleRow;
  expect(baseTier(row)).toMatchObject({ minQty: 2, unitUsdMinor: 11000 });
  expect(baseTier({ ...row, tiers: [] })).toBeNull();
});
it("separa en láminas sin perder productos y fecha según Buenos Aires", () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({ productId: String(i), tiers: [{ minQty: 1, unitUsdMinor: 100 }] }) as WholesaleRow);
  expect(exportPages(rows).map((p) => p.length)).toEqual([6, 6, 1]);
  expect(exportPages(rows).flat()).toEqual(rows);
  expect(exportPages([])).toEqual([]);
  expect(exportPages([...rows, { productId: "pendiente", tiers: [] } as unknown as WholesaleRow]).flat()).toEqual(rows);
  expect(exportDate(Date.parse("2026-11-07T01:00:00Z"))).toBe("06/11/2026");
});

it("crea un PDF válido con una página por lámina y la fecha de esa generación", async () => {
  const png = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN4sAAAAASUVORK5CYII=", "base64")], { type: "image/png" });
  const time = Date.parse("2026-11-06T18:00:00Z");
  const blob = await catalogPdf([png, png], time);
  expect(blob.type).toBe("application/pdf");
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getCreationDate()?.getTime()).toBe(time);
  expect(pdf.getPages().every((page) => page.getWidth() === 540)).toBe(true);
});
it("no crea un PDF vacío si no hay productos con precio", async () => {
  await expect(catalogPdf([], Date.now())).rejects.toThrow("No hay láminas");
});

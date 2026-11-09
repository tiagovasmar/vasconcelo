import { describe, expect, it } from "vitest";
import { demoCatalog } from "@/content/catalog";
import { evaluateCart, maxFor } from "@/features/inquiries/pricing";
import { buildAddonCatalog, previewAddons } from "@/features/promos/adicionales";
import type { ComboConfig } from "@/features/promos/combo";
import { boxesAddable, comboSlots } from "@/features/promos/cupos";

/**
 * Cupos del combo caja + sobres que muestra la ficha frente a lo que calcula el servidor. Caso real del informe de carga: con la caja en su máximo del
 * carrito, la ficha contaba igual una caja más («5 → 10 cupos») aunque ya no podía agregarse.
 */
const products = demoCatalog.products;
const CFG: ComboConfig = { enabled: true, boxIds: ["storm-caja", "ejemplo-caja"], boosterIds: ["storm-sobre", "ejemplo-sobre", "parcial-sobre"] };
const img = () => ({ src: null, alt: "x" });
const catalog = buildAddonCatalog(products, CFG, products.find((p) => p.id === "storm-caja")!, img)!;
const price = (id: string) => products.find((p) => p.id === id)!.priceMinor as number;
const line = (productId: string, quantity: number) => ({ productId, quantity, expectedPriceMinor: price(productId), mode: "buy" as const });

type Cart = Array<ReturnType<typeof line>>;
/** Lo que haría la ficha de la caja `storm-caja`: cantidad elegida, sobres elegidos y carrito. */
function ficha(cart: Cart, chosen: number, picked: Record<string, number>) {
  const stormBox = products.find((p) => p.id === "storm-caja")!;
  const inCart = cart.find((c) => c.productId === "storm-caja")?.quantity ?? 0;
  const room = Math.max(0, maxFor(stormBox) - inCart);
  const addQty = boxesAddable(chosen, room);
  const qtyInCart = (id: string) => cart.find((c) => c.productId === id)?.quantity ?? 0;
  const pickedCount = Object.values(picked).reduce((n, v) => n + v, 0);
  const client = comboSlots({ perBox: catalog.perBox, participatingBoxIds: catalog.participatingBoxIds, participatingBoosterIds: catalog.participatingBoosterIds, qtyInCart, boxesToAdd: addQty, pickedBoosters: pickedCount });
  const add = [...(addQty > 0 ? [line("storm-caja", addQty)] : []), ...Object.entries(picked).map(([id, n]) => line(id, n))];
  const server = previewAddons(products, CFG, cart, add.length ? add : [line("storm-sobre", 0)]);
  // Estado del carrito después de agregar lo que se puede: de ahí salen los cupos «oficiales» del servidor.
  const merged = new Map(cart.map((c) => [c.productId, c.quantity]));
  for (const a of add) merged.set(a.productId, (merged.get(a.productId) ?? 0) + a.quantity);
  const after = evaluateCart([...merged].map(([productId, quantity]) => line(productId, quantity)), products, CFG).pricing;
  return { client, server, after, addQty, room };
}

describe("cupos de la ficha frente al servidor", () => {
  it("la caja ya está en su máximo: no se cuenta una caja más (antes: 15 cupos en vez de 10)", () => {
    const { client, after, addQty, room } = ficha([line("storm-caja", 2)], 1, {});
    expect(room).toBe(0);
    expect(addQty).toBe(0);
    expect(client.slots).toBe(10);
    expect(after.combo.slots).toBe(10);
    expect(client.free).toBe(after.combo.freeSlots);
  });

  it("una caja en el carrito y lugar para otra: la caja que se está por agregar sí cuenta", () => {
    const { client, after, addQty } = ficha([line("storm-caja", 1)], 1, {});
    expect(addQty).toBe(1);
    expect(client.slots).toBe(10);
    expect(client.free).toBe(after.combo.freeSlots);
  });

  it("varias cajas y sobres ya agregados + sobres elegidos: ficha, carrito y servidor coinciden", () => {
    const cart = [line("storm-caja", 1), line("ejemplo-caja", 1), line("storm-sobre", 3), line("ejemplo-sobre", 2)];
    const { client, after, server } = ficha(cart, 1, { "parcial-sobre": 2, "storm-sobre": 1 });
    // 3 cajas (2 en el carrito + 1 por agregar) → 15 cupos; 5 sobres en el carrito + 3 elegidos → quedan 7
    expect(client.slots).toBe(15);
    expect(client.free).toBe(7);
    expect(after.combo.freeSlots).toBe(7);
    expect(server.ok).toBe(true);
  });

  it("más sobres que cupos: la ficha no deja libre nada y el servidor tampoco", () => {
    const cart = [line("storm-caja", 2), line("storm-sobre", 8), line("ejemplo-sobre", 2)];
    const { client, after } = ficha(cart, 1, {});
    expect(client.free).toBe(0);
    expect(after.combo.freeSlots).toBe(0);
  });

  it("sin caja en el carrito y sin poder agregar (sin stock): no hay cupos", () => {
    const sinStock = products.map((p) => (p.id === "storm-caja" ? { ...p, stockQuantity: 0 } : p));
    expect(maxFor(sinStock.find((p) => p.id === "storm-caja")!)).toBe(0);
    const slots = comboSlots({ participatingBoxIds: ["storm-caja"], participatingBoosterIds: [], qtyInCart: () => 0, boxesToAdd: boxesAddable(1, 0), pickedBoosters: 0 });
    expect(slots.free).toBe(0);
  });

  it("boxesAddable: lo elegido, acotado por el lugar que queda; nunca menos de 1 si hay lugar ni más de lo que hay", () => {
    expect(boxesAddable(0, 3)).toBe(1);
    expect(boxesAddable(5, 2)).toBe(2);
    expect(boxesAddable(2, 2)).toBe(2);
    expect(boxesAddable(1, 0)).toBe(0);
  });
});

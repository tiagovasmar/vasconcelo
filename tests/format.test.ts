import { describe, expect, it } from "vitest";
import { formatARS } from "@/lib/format";

describe("formatARS", () => {
  it("formatea centavos enteros como pesos argentinos", () => {
    expect(formatARS(950000).replace(/\s/g, " ")).toMatch(/9\.500/);
    expect(formatARS(6100000)).toMatch(/61\.000/);
  });
});

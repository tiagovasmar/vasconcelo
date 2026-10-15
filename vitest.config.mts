import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/*.test.ts"],
    // PostgreSQL real y descartable para toda la corrida (tests/pg-global-setup.ts); cada prueba recibe su propia base copiada de una plantilla migrada.
    globalSetup: ["tests/pg-global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Las pruebas de reglas usan el catálogo de PRUEBA (productos ficticios con precio y stock). Las pruebas del catálogo
    // real importan `realCatalog` directamente y no dependen de esta variable.
    // Las pruebas nunca tocan datos reales: usan bases PostgreSQL descartables y no salen a internet.
    env: { CATALOG_FIXTURE: "demo", FX_AUTO_REFRESH: "0", STORAGE_DRIVER: "local" },
  },
});

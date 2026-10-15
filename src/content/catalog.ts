import type { Catalog } from "./schema";
import { realCatalog } from "./real";
import { demoCatalog } from "./fixtures/demo";

export { realCatalog, demoCatalog };

/**
 * Catálogo en uso. Siempre el real, salvo que se defina CATALOG_FIXTURE=demo: eso solo lo hacen las pruebas automatizadas
 * para disponer de productos con precio y stock de ejemplo. Nunca se mezclan, y `npm run release:check` marca esa variable.
 */
export const catalog: Catalog = process.env.CATALOG_FIXTURE === "demo" ? demoCatalog : realCatalog;

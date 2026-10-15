import type { Catalog } from "../../schema";
import { sources } from "./sources";
import { expansions } from "./expansions";
import { products } from "./products";
import { pullRates } from "./pull-rates";
import { guarantees } from "./guarantees";

/**
 * CATÁLOGO DE PRUEBA (ficticio). Solo existe para las pruebas automatizadas: productos «de ejemplo», con precio y stock de
 * ejemplo, para poder probar el carrito, los filtros y los estados de la ficha. NUNCA forma parte del catálogo comercial.
 * Se activa únicamente con la variable de entorno CATALOG_FIXTURE=demo (la usan las pruebas); `release:check` lo marca.
 */
export const demoCatalog: Catalog = { sources, expansions, products, pullRates, guarantees };

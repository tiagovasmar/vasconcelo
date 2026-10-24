import "server-only";
import { cache } from "react";
import { getDb } from "@/db/client";
import type { EffectiveRate } from "./convert";
import { pageDataOncePerRequest } from "@/features/catalog/page-data";
import { currentRate } from "./service";

/**
 * Cotización vigente leída UNA sola vez por pedido de página (`cache` de React: dura lo que dura ese pedido, nunca entre pedidos, así un cambio del panel o una
 * renovación se ven en el pedido siguiente). La usan el armado del catálogo y la nota de cotización: antes cada uno la pedía por su cuenta (2 consultas iguales por página).
 */
export const rateOncePerRequest = cache(async (): Promise<EffectiveRate> => currentRate(getDb(), Date.now(), (await pageDataOncePerRequest()).fxRow));

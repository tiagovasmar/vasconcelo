import { z } from "zod";

export { kindLabel, languageLabel, wideKinds } from "./labels";

/** Esquemas del catálogo. Campos desconocidos quedan ausentes/nulos: nunca se rellenan con certezas ficticias. */

/** Idiomas de edición. `zh` = chino simplificado (China continental); no se asigna a ediciones sin verificar. */
export const languages = ["ja", "en", "es", "zh"] as const;
/** `na` = no aplica: solo para productos sin idioma de edición (accesorios). Nunca se ofrece como filtro de idioma. */
export type Language = (typeof languages)[number] | "na";
const LanguageSchema = z.enum(languages);
const ProductLanguageSchema = z.enum([...languages, "na"]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");
export const productKinds = ["booster", "pack", "box", "bundle", "kit", "special-box", "illustration-set", "accessory"] as const;
export type ProductKind = (typeof productKinds)[number];
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "id en minúsculas, números y guiones");

export const SourceSchema = z.object({
  id,
  url: z.string().url(),
  publisher: z.string().min(1),
  consultedAt: isoDate,
  scope: z.string().min(1),
  note: z.string().optional(),
});

export const ImageAssetSchema = z.object({
  /** Ruta bajo /public. Si el archivo no existe y status es "demo", se muestra la ilustración de reserva. */
  src: z.string().startsWith("/images/"),
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** demo = ilustración de reserva · reference = foto/arte real de una fuente oficial, SIN permiso de uso concedido (solo integración local) · final = con permiso registrado. */
  status: z.enum(["demo", "reference", "final"]),
  /** true si el archivo no tiene transparencia (p. ej. JPG): se muestra sobre fondo blanco. */
  opaque: z.boolean().optional(),
  /** Registro de origen/permiso (manifiesto de imágenes). */
  origin: z.string().min(1),
  license: z.string().min(1),
  /** Quién sacó la foto: el fabricante (referencia), un proveedor/vendedor de origen (referencia, p. ej. publicaciones de Tmall o Taobao), la tienda (stock real) o una ilustración generada (no es una foto de ningún artículo real). Sin dato = fabricante. */
  source: z.enum(["manufacturer", "store", "supplier", "illustration"]).optional(),
  /** Qué muestra: frente, dorso, laterales, detalle, contenido físico, caja cerrada o caja abierta de exhibición. */
  view: z.enum(["front", "back", "left", "right", "top", "bottom", "detail", "contents", "closed", "display-open"]).optional(),
});

export const ContentItemSchema = z.object({
  label: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  unit: z.string().optional(),
  note: z.string().optional(),
});

/** Qué se averiguó sobre las rarezas garantizadas de una caja/kit. «not_documented» = se revisaron las fuentes indicadas y NINGUNA declara una rareza garantizada (no significa que no haya un patrón habitual). */
export const RarityReviewSchema = z.object({
  status: z.enum(["not_documented"]),
  checkedAt: isoDate,
  /** Fuentes revisadas (ids de `sources`). */
  sourceIds: z.array(id).min(1),
  /** Qué se revisó y qué resultado dio (alcance exacto). */
  note: z.string().min(1),
});

/** Cómo se denomina una colección o un producto en el nombre principal en inglés (cuando lo hay). */
export const NameInfoSchema = z.object({
  /** official = nombre impreso/publicado por el fabricante · community = nombre difundido por bases de datos y tiendas, NO oficial · descriptive = traducción descriptiva de la tienda, NO oficial. */
  kind: z.enum(["official", "community", "descriptive"]),
  /** sources_agree = las fuentes coinciden · variants = hay variantes del nombre entre fuentes · inferred = deducido por patrón de una fuente hermana. */
  certainty: z.enum(["sources_agree", "variants", "inferred"]),
  /** Otras denominaciones en inglés vistas en las fuentes (se buscan, pero no son el nombre principal). */
  variants: z.array(z.string().min(1)),
  sourceIds: z.array(id),
  verifiedAt: isoDate,
});
export type NameInfo = z.infer<typeof NameInfoSchema>;

export const ProductSchema = z.object({
  id,
  sku: z.string().min(1),
  slug: id,
  title: z.string().min(1),
  /** booster = sobre · pack = pack armado · box = caja de sobres · bundle = conjunto · kit = kit de mazo · special-box = caja especial · illustration-set = set de ilustraciones. */
  kind: z.enum(productKinds),
  /** Diferencia fichas de la misma colección y formato (p. ej. «5 cartas» y «20 cartas», «Vol.2» y «Vol.3»). */
  variant: z.string().min(1).optional(),
  /** Origen del nombre principal en inglés (solo fichas que no heredan el nombre de una colección). */
  nameInfo: NameInfoSchema.optional(),
  /** Retirado de la oferta pública (no se vende ni se encarga; se conserva para consultas históricas). Siempre con `active: false`. */
  retired: z.object({ date: isoDate, reason: z.string().min(1) }).optional(),
  /** Borrador: ficha creada pero NO publicada porque hay un dato pendiente de confirmar (se explica acá). El panel la muestra con este aviso; no se ve en la tienda mientras esté oculta. */
  draftNote: z.string().min(1).optional(),
  /** Nombre original del producto en el idioma de la edición (p. ej. chino). `title` es el nombre principal en español; este es un dato secundario para búsquedas y trazabilidad. */
  originalTitle: z.string().min(1).optional(),
  /** Términos de búsqueda adicionales (p. ej. romanización del nombre chino); no se muestran. */
  aliases: z.array(z.string().min(1)).optional(),
  language: ProductLanguageSchema,
  region: z.string().min(1),
  /** Colecciones del producto. Vacío = no pertenece a una sola colección (kits y cajas especiales). */
  expansionIds: z.array(id),
  currency: z.literal("ARS"),
  /**
   * Moneda del precio BASE. Sin dato = `usd` (todos los productos anteriores: el dueño carga dólares y el sitio muestra pesos convertidos).
   * `ars` = precio fijo en pesos (accesorios): no depende del dólar ni de la cotización; no tiene precio USD.
   */
  priceBase: z.enum(["usd", "ars"]).optional(),
  /** Precio fijo inicial en centavos de ARS (solo `priceBase: "ars"`). El dueño lo puede cambiar desde /admin; sin cambios propios rige este. */
  fixedPriceMinor: z.number().int().positive().optional(),
  /** Unidades que trae UNA unidad de venta (p. ej. 5 en «Pack de 5 unidades»). El stock se administra en packs: comprar uno descuenta uno. */
  packSize: z.number().int().min(2).optional(),
  /** Precio base en centavos de USD (USD 10,00 = 1000). `null` = pendiente. Casi nunca viene del código: lo carga el dueño desde /admin. */
  priceUsdMinor: z.number().int().positive().nullable().optional(),
  /** Disponible solo por encargo (se consulta y se cotiza; no se vende de stock). Lo define el panel. */
  orderOnly: z.boolean().optional(),
  /** Precio en pesos, derivado del USD con la cotización vigente (múltiplo de $100). `null` = precio PENDIENTE de confirmar (no es $0): el producto no se puede agregar a una consulta. */
  priceMinor: z.number().int().positive().nullable(),
  /** Unidades disponibles. `null` = disponibilidad PENDIENTE de confirmar (no es 0 ni «agotado»). */
  stockQuantity: z.number().int().nonnegative().nullable(),
  /** Máximo por pedido (opcional; el límite efectivo es el menor entre esto y el stock). */
  maxPerOrder: z.number().int().positive().optional(),
  /** Estado del sellado del inventario de la tienda, si el dueño lo informa (las fotos del fabricante no lo acreditan). */
  ownerSealCondition: z.string().min(1).nullable().optional(),
  active: z.boolean(),
  isDemo: z.boolean(),
  /** Revisión de rarezas garantizadas (cajas, cajas especiales y kits). */
  rarityReview: RarityReviewSchema.optional(),
  createdAt: isoDate,
  images: z.array(ImageAssetSchema).min(1),
  /** Tono de la ilustración de reserva mientras no haya foto. */
  fallbackTone: z.enum(["mint", "ink", "paper", "violet", "gold"]),
  description: z.string().min(1),
  contents: z.array(ContentItemSchema),
  guaranteeIds: z.array(id),
  packComposition: z.array(z.object({ expansionId: id, packCount: z.number().int().positive() })).optional(),
});

export const CardSchema = z.object({
  id,
  expansionId: id,
  name: z.string().min(1),
  number: z.string().min(1),
  rarity: z.string().optional(),
  variant: z.string().optional(),
  image: ImageAssetSchema,
  sourceIds: z.array(id),
  pullRateIds: z.array(id),
  isDemo: z.boolean(),
});

export const ExpansionSchema = z.object({
  id,
  slug: id,
  name: z.string().min(1),
  /** Código de la colección (p. ej. M6). Opcional: no se inventa donde la fuente no lo informa. */
  code: z.string().min(1).optional(),
  language: LanguageSchema,
  region: z.string().min(1),
  japaneseName: z.string().optional(),
  /** Nombre original en el idioma de la edición (p. ej. chino). `name` es el nombre principal en español (traducción descriptiva de la tienda, no oficial). */
  originalName: z.string().min(1).optional(),
  /** Origen del nombre principal en inglés y variantes (colecciones chinas). */
  nameInfo: NameInfoSchema.optional(),
  /** Términos de búsqueda adicionales (nombre español anterior, romanización, variantes en inglés); no se muestran. */
  aliases: z.array(z.string().min(1)).optional(),
  series: z.string().optional(),
  /** Fecha de lanzamiento (Japón), AAAA-MM-DD. */
  releaseDate: isoDate.optional(),
  summary: z.string().min(1),
  /** Aclaración sobre la cobertura de la lista de cartas (se muestra junto al estado). */
  cardListNote: z.string().optional(),
  /** Cantidad de cartas que informa la fuente oficial al armar la lista (para comprobar la cobertura). */
  officialCardCount: z.number().int().positive().optional(),
  isDemo: z.boolean(),
  sourceIds: z.array(id),
  cardListStatus: z.enum(["complete", "partial", "unavailable"]),
  cards: z.array(CardSchema),
  tone: z.enum(["mint", "ink", "paper", "violet", "gold"]),
});

export const PullRateSchema = z.object({
  id,
  expansionId: id,
  language: LanguageSchema,
  region: z.string().min(1),
  target: z.object({ kind: z.enum(["card", "rarity"]), id: z.string().min(1) }),
  unit: z.enum(["booster", "box"]),
  productScope: z.string().min(1),
  /** null = dato desconocido (nunca 0%). */
  probability: z.number().min(0).max(1).nullable(),
  evidence: z.enum(["official", "observed", "unavailable"]),
  sampleSize: z.number().int().positive().optional(),
  observedHits: z.number().int().nonnegative().optional(),
  sampleUnit: z.string().optional(),
  interval: z.object({ low: z.number().min(0).max(1), high: z.number().min(0).max(1), method: z.string() }).optional(),
  method: z.string().optional(),
  sourceIds: z.array(id),
  reviewedAt: isoDate,
});

export const GuaranteeSchema = z.object({
  id,
  /** id del producto al que aplica. */
  scope: id,
  language: LanguageSchema,
  region: z.string().min(1),
  statement: z.string().min(1),
  /** Cómo leer la cantidad: fixed = cantidad fija · minimum = mínimo garantizado · alternatives = una de varias combinaciones alternativas (no se suman). Sin dato = fija. */
  quantityKind: z.enum(["fixed", "minimum", "alternatives"]).optional(),
  /** composition = garantía de composición por sobre (p. ej. «1 carta ex garantizada»): no es una carta ni una probabilidad concretas. */
  type: z.enum(["physical_contents", "fixed_promo", "rarity", "composition"]),
  evidence: z.enum(["official", "seller_pack_contents", "unverified"]),
  sourceIds: z.array(id),
  reviewedAt: isoDate,
});

export type Source = z.infer<typeof SourceSchema>;
export type ImageAsset = z.infer<typeof ImageAssetSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Expansion = z.infer<typeof ExpansionSchema>;
export type PullRate = z.infer<typeof PullRateSchema>;
export type Guarantee = z.infer<typeof GuaranteeSchema>;

export type Catalog = {
  /** Ids de productos destacados en el inicio, en orden (opcional). */
  featuredIds?: string[];
  sources: Source[];
  expansions: Expansion[];
  products: Product[];
  pullRates: PullRate[];
  guarantees: Guarantee[];
};

/** Valor del filtro `formato` en la URL para cada formato. */
export const kindSlug = { booster: "sobre", pack: "pack", box: "caja", bundle: "bundle", kit: "kit", "special-box": "especial", "illustration-set": "ilustraciones", accessory: "accesorios" } as const satisfies Record<ProductKind, string>;
export type RarityReview = z.infer<typeof RarityReviewSchema>;

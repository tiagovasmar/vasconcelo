# Guía del catálogo (alta por código)

El catálogo es la fuente de verdad y vive en archivos versionados bajo `src/content/`. El panel `/admin` solo administra precio, stock, máximo por pedido y visibilidad (valores de la base de datos que reemplazan a los del código por producto; ver [ADMIN.md](ADMIN.md)). No hay alta de productos desde la web: se edita el código, se corre la validación y se publica.

```
src/content/
  schema.ts        # tipos y validación (Zod)
  sources.ts       # fuentes (URL, editor, fecha de consulta, alcance)
  expansions/      # expansiones y sus cartas
  products/        # productos sellados (SKU)
  pull-rates.ts    # tasas de aparición (solo con evidencia)
  guarantees.ts    # garantías por producto
  catalog.ts       # reúne todo
public/images/     # imágenes (ver docs/ASSETS-PENDIENTES.md)
```

Comandos: `npm run catalog:check` valida todo (errores cortan; avisos informan). `npm run dev` para verlo.

> **Formatos** (`kind`): `booster` (sobre), `pack`, `box` (caja), `bundle`, `kit` (kit de mazo), `special-box` (caja especial) e `illustration-set` (set de ilustraciones). `variant` distingue fichas de la misma colección y formato (5 vs 20 cartas, Vol.2 vs Vol.3); `expansionIds` puede ir vacío (kits y cajas especiales); `aliases` suma términos de búsqueda. El lote chino se arma desde `src/content/colecciones/origen/china/productos.json` (ver IMPORTACION-CHINA.md).

## Reglas que el validador hace cumplir

IDs/SKU/slug sin duplicados · referencias existentes (expansiones, garantías, fuentes, tasas) · precio entero positivo en **centavos** · stock entero ≥ 0 · probabilidad en [0,1] o `null` · tasa `official` con fuente · tasa `observed` con muestra, aciertos, unidad de muestra, método y fuente · tasa `unavailable` sin número · garantía `official` con fuente · garantía de **rareza** solo con fuente oficial (nunca por composición del vendedor) · mismo idioma/región entre producto, expansión, tasa y garantía · estado de lista de cartas coherente (`complete` con cartas, `partial` con algunas, `unavailable` sin cartas) · imagen `final` inexistente = error; imagen `demo` sin archivo = aviso · packs con varias expansiones requieren `packComposition`.

## Ejemplo completo válido

1. **Imágenes** → copiar a `public/images/products/ABC-123/01.webp` (4:5, ≥ 1200×1500), `02.webp`, `03.webp`; cartas en `public/images/expansions/mi-set/cards/001.webp` (5:7, ≥ 600×840).

2. **Fuente** (`sources.ts`):
```ts
{ id: "fuente-mi-set", url: "https://ejemplo.com/mi-set", publisher: "Editor oficial", consultedAt: "2026-10-20",
  scope: "Ficha oficial: 36 sobres por caja, 10 cartas por sobre." }
```

3. **Expansión** (`src/content/real/expansions.ts`; el catálogo ficticio de pruebas está en `src/content/fixtures/demo/`):
```ts
{ id: "mi-set", slug: "mi-set", name: "Mi Set", code: "MS1", language: "es", region: "AR",
  summary: "Texto editorial breve.", isDemo: false, sourceIds: ["fuente-mi-set"],
  cardListStatus: "partial", tone: "mint",
  cards: [{ id: "mi-set-001", expansionId: "mi-set", name: "Nombre de la carta", number: "001", rarity: "Rara",
    image: { src: "/images/expansions/mi-set/cards/001.webp", alt: "Nombre de la carta, carta 001", width: 600, height: 840,
             status: "final", origin: "Foto del dueño", license: "Propia" },
    sourceIds: [], pullRateIds: [], isDemo: false }] }
```
Si no hay lista verificada: `cardListStatus: "unavailable"` y `cards: []` (la ficha muestra «Lista no disponible» y el enlace a la fuente). **Nunca** cargar cartas de relleno en una expansión real.

4. **Producto** (`products/index.ts`):
```ts
{ id: "mi-set-caja", sku: "ABC-123", slug: "mi-set-caja", title: "Mi Set · Caja", kind: "box", language: "es", region: "AR",
  expansionIds: ["mi-set"], currency: "ARS", priceMinor: 12500000 /* $125.000 */, stockQuantity: 4, maxPerOrder: 2,
  active: true, isDemo: false, createdAt: "2026-10-20", fallbackTone: "ink",
  images: [{ src: "/images/products/ABC-123/01.webp", alt: "Caja cerrada, frente", width: 1200, height: 1500,
             status: "final", origin: "Foto propia", license: "Propia" }],
  description: "Caja sellada de fábrica.", contents: [{ label: "Sobres por caja", quantity: 36, unit: "sobres" }],
  guaranteeIds: ["g-mi-set-caja"] }
```

5. **Garantía** (`guarantees.ts`): `scope` = id del producto; mismo idioma y región; una de rareza solo si la fuente oficial la afirma para ese SKU.
```ts
{ id: "g-mi-set-caja", scope: "mi-set-caja", language: "es", region: "AR", type: "physical_contents",
  statement: "36 sobres por caja. Contenido aleatorio.", evidence: "official", sourceIds: ["fuente-mi-set"], reviewedAt: "2026-10-20" }
```

6. **Tasa** (`pull-rates.ts`) — solo con evidencia. Oficial: `evidence: "official"`, `probability`, `sourceIds`. Observada: además `sampleSize`, `observedHits`, `sampleUnit`, `method` (y `interval` si existe). Sin evidencia: `probability: null`, `evidence: "unavailable"` (se muestra «Dato no disponible», nunca 0 %). Una tasa **por sobre** solo se muestra en sobres/packs y **por caja** solo en cajas/bundles; no se convierte entre ellas ni entre idiomas o regiones.

7. Correr `npm run catalog:check`, revisar `npm run dev`, commit.

## Operación

- Retirar un producto: poner `active: false` (no se borra; las consultas históricas conservan su snapshot).
- Stock manual: el dueño pide el cambio de `stockQuantity` tras cerrar una venta; la disponibilidad visible cambia al publicar ese cambio, no al abrir WhatsApp.
- Productos demo (`isDemo: true`) y expansiones ficticias se retiran antes de vender; `catalog:check` los avisa.
- Reemplazar imágenes de reserva: copiar el archivo con la ruta ya declarada y, si corresponde, cambiar `status` a `final` y completar `origin`/`license`.

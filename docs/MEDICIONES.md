# Mediciones del 14/10/2026: cotización y rendimiento

Todo sobre un **build de producción** (`next build` + `next start`) con una **copia** de la base local (nunca la real). Son mediciones locales y simuladas (Chromium de Playwright): no son usuarios reales ni un hosting concreto. Sin push ni despliegue.

## 1. Fallos de la cotización (integración real, no solo funciones)
`npm run fx:probar-fallos` (`scripts/probar-cotizacion-fallos.mjs`) levanta un proveedor falso del dólar y la tienda en producción, fuerza consultas con `/api/fx/refresh` y mira qué ve la tienda y qué guarda la base. Resultado completo en `docs/cotizacion-fallos.json`. **19 de 19 escenarios se comportan como se espera:**

| Escenario | Resultado |
| --- | --- |
| Proveedor correcto (venta 1500) | guarda la cotización; USD 152 → `$ 228.000` |
| HTTP 500, JSON roto, HTML de mantenimiento, otra casa (oficial), otra moneda, venta negativa, venta como texto, salto ×3 | la consulta falla, **se conserva la última cotización válida**, se registra el error y la tienda sigue mostrando `$ 228.000` |
| Publicación del proveedor de hace 6 días | se acepta la consulta pero la cotización queda «sin vigencia»: `Precio a confirmar` + `USD 152,00` |
| Proveedor que se recupera (1600) | vuelve a convertir (`$ 243.200`) y limpia el error |
| Proveedor que **no responde** | la consulta se corta a los **6 s** (medido 6.018 ms) y mientras tanto las páginas responden en 26–35 ms con la cotización guardada |
| Última consulta exitosa de hace 5 h | se sigue convirtiendo, con aviso de antigüedad |
| Hace 25 h | **no se convierte**: `Precio a confirmar` + USD visible, nunca `$0`; el catálogo sigue respondiendo |
| Modo manual con el proveedor caído | rige el valor manual (1234 → `$ 187.600`), no cambia solo |
| Endpoint de actualización sin secreto / con secreto malo | 401 / 401 |

Un único endurecimiento: `kickRefreshIfDue` (que se ejecuta al renderizar páginas) ahora **nunca puede romper la página** si la base está ocupada un instante (antes podía lanzar una excepción síncrona). No cambió ninguna regla comercial (umbrales de 2 h / 24 h / 5 días, redondeo a $100, blue venta).

## 2. Rendimiento (catálogo real)
`npm run rendimiento:real` (`CATALOG=real RUNS=3 node scripts/rendimiento.mjs`, mediana de 3 corridas; resultado en `docs/rendimiento-real.json`). Perfiles: **escritorio** (sin límites); **móvil** (390×844, CPU 4× más lenta, 1,6 Mb/s, 150 ms); **móvil lento** (CPU 4×, ≈ 3G: 400 kb/s, 400 ms de latencia). Presupuestos: CLS < 0,1, TBT < 300 ms, LCP < 2,5 s escritorio, < 4 s móvil, < 8 s móvil lento. **Se cumplen todos.**

### Qué se encontró
Las fichas con foto de proveedor tardaban en el celular lento (LCP 6,3–7,0 s) y pesaban 777 KB en escritorio. Causas medidas (lista de pedidos por página con red limitada):
1. **Las miniaturas de la galería pedían la imagen grande** (usaban el `sizes` de la foto principal): cada ficha descargaba 3–4 veces su portada.
2. **Las cartas de la grilla pedían la versión de 1200 px** de una imagen de origen de 360 px.
3. Las cartas lejanas y las tarjetas de productos relacionados competían por ancho de banda con la foto principal (el `loading="lazy"` del navegador adelanta miles de píxeles en conexiones lentas).
4. Las fotos de proveedor (opacas, tipo fotografía) pesan el doble que el arte con transparencia.

### Qué se corrigió (sin tocar condiciones comerciales)
Miniaturas con su propio `sizes` chico y prioridad baja; fotos opacas de la ficha con calidad 60 (`images.qualities`); `sizes` reales en la grilla de cartas; las cartas se piden al acercarse (carga por proximidad, con el hueco reservado: CLS 0); tarjetas relacionadas con prioridad baja.

### Antes → después (móvil lento, LCP en ms / KB transferidos)
| Página | Antes | Después |
| --- | --- | --- |
| Ficha caja con fotos de Pokémon Center | 3.416 / 551 | **3.100 / 268** |
| Ficha caja con foto de proveedor (151) | 6.348 / 374 | **5.220 / 294** |
| Ficha caja china (Terastal Gathering) | 6.972 / 419 | **5.308 / 328** |
| Colección con 120 cartas | 2.512 / 576 | **2.472 / 271** |
| Colección con 237 cartas | 2.512 / 624 | **2.404 / 283** |

Escritorio (KB): ficha caja 777 → 320; ficha 151 721 → 339; colección 120 cartas 586 → 347. Móvil normal: LCP de las fichas con foto de proveedor 1.520 / 1.708 → **1.388 / 1.420 ms**.

### Resultado final (LCP mediano, ms)
| Perfil | Inicio | Catálogo cajas | En stock | Ficha (oficial) | Ficha (proveedor) | Ficha china | Colección 120 | Colección 237 | Carrito |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Escritorio | 156 | 128 | 112 | 148 | 156 | 136 | 148 | 152 | 108 |
| Móvil | 1.268 | 992 | 964 | 1.044 | 1.388 | 1.420 | 1.056 | 1.048 | 872 |
| Móvil lento | 3.456 | 2.340 | 2.340 | 3.100 | 5.220 | 5.308 | 2.472 | 2.404 | 2.292 |

CLS 0 en todas; TBT 46–98 ms en móvil y 0 en escritorio. **Límites:** la mayor demora restante (≈ 5 s en 3G simulado) es el peso de una foto de proveedor de ≈ 80 KB más el JavaScript de la página en una red de 400 kb/s; para bajarla haría falta una foto de proveedor más liviana o un CDN, algo que depende del hosting. No se midió bajo carga de varios usuarios ni con Lighthouse.

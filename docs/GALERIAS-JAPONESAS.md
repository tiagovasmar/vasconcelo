# Galerías japonesas oficiales — 14/10/2026

Se incorporan las listas de cartas e imágenes del buscador oficial japonés a cinco colecciones existentes, sin crear productos ni cambiar precios o stock. Terastal Gathering (chino) no se modifica: el dueño confirmó que quería Terastal Fest ex japonesa.

| Colección | Código | Grupo oficial | Cartas | Página oficial |
| --- | --- | --- | --- | --- |
| Terastal Festival ex / Terastal Fest ex | SV8a | 934 | 237 | https://www.pokemon-card.com/ex/sv8a/ |
| Ninja Spinner | M4 | 953 | 120 | https://www.pokemon-card.com/ex/m4/ |
| Nihil Zero | M3 | 952 | 117 | https://www.pokemon-card.com/ex/m3/ |
| Mega Symphonia | M1S | 945 | 92 | https://www.pokemon-card.com/ex/m1/ |
| Pokémon Card 151 | SV2a | 882 | 210 | https://www.pokemon-card.com/ex/sv2a/ |

Total: 776 imágenes de cartas. Todos los códigos impresos coinciden con la edición importada y los números van de 001 al máximo sin huecos. Esto describe la cobertura del buscador; los acabados espejo no se contabilizan como cartas independientes. En SV8a 152 cartas no muestran ícono de rareza, por lo que ese dato queda sin informar.

Las imágenes optimizadas WebP se guardan en `public/images/expansions/<colección>/cards/`. Las listas están en `src/content/colecciones/cartas/` y las URLs de origen, huellas y dimensiones en `src/content/colecciones/imagenes-cartas.json`. Se conservan como referencia local con su estado de permiso existente, sin afirmar que el fabricante concede una licencia por publicar el enlace.

Las galerías existentes de las fichas y expansiones permiten buscar por nombre japonés o número, filtrar rareza, ampliar y mostrar 12 cartas por tanda. No se descargan las 776 imágenes al abrir el inicio. No representan cartas garantizadas dentro de una caja.

Las páginas de expansión muestran sobres y, en algunos casos, otros kits diferentes. La página compartida M1 se filtra por el grupo 945 (M1S), sin mezclar Mega Brave.

## Cajas de Pokémon Center

Desde la categoría oficial que aportó el dueño se accedió a las fichas públicas en el navegador y se guardaron dos fotos de 1500 × 1500 px por producto, optimizadas a WebP sin escalar ni retocar el arte. Caja cerrada como portada, exhibición abierta como segunda vista y sobre original como tercera. Son referencias del fabricante, no fotos del stock propio.

- Ninja Spinner: https://www.pokemoncenter-online.com/9900000007898.html
- Nihil Zero: https://www.pokemoncenter-online.com/9900000007003.html
- Mega Symphonia: https://www.pokemoncenter-online.com/9900000006228.html
- Terastal Fest ex: https://www.pokemoncenter-online.com/9900000006167.html
- Team Rocket: https://www.pokemoncenter-online.com/9900000006037.html

Registro: `src/content/colecciones/imagenes-cajas-center.json`. Importador de archivos originales: `scripts/colecciones/importar-cajas-center.mjs <manifiesto-descargas>`. Las URLs grandes se observaron en las fichas y se descargaron con el navegador, sin adivinar nombres de archivo ni sortear una sala de espera.

Pokémon Card 151 no apareció en las 42 entradas de la categoría ni en la búsqueda interna `ポケモンカード151` (solo tres accesorios), y no se encontró otra fuente oficial con foto de la caja.

**Foto de la caja de 151 (14/10/2026, segunda pasada):** se usa la foto real de la caja cerrada que aportó el dueño, tomada de una **captura de una publicación de un proveedor** (la dirección de la publicación no quedó registrada). Se conserva el original en `recursos-originales/japon-cajas/`, se recortó solo el área de la foto (sin la interfaz de la publicación) y se guardó como WebP (`public/images/products/japon-cajas/pokemon-card-151-closed.webp`, 906 × 907 px; registro con huellas en `src/content/colecciones/imagenes-cajas-proveedor.json`, importador `scripts/colecciones/importar-foto-151.mjs`). Está marcada como foto de proveedor, caja cerrada sostenida en la mano: referencia, no acredita el estado ni el stock de la tienda. La captura muestra una variante «Sv4a» preseleccionada en la publicación, pero la caja fotografiada es inequívocamente la de 151 (SV2a): se usa solo la foto, no los datos de la publicación. La segunda imagen es el sobre oficial. **Sigue pendiente una foto oficial de la caja** (o una foto propia desde `/admin`). No se usó la carpeta 151 ni otra edición.

## Verificación

`npm run verify` completo: typecheck, lint y catálogo sin errores; 305 pruebas pasadas. Se verificaron en el navegador los conteos de las cinco galerías, la búsqueda por número y la ampliación; las cinco portadas de caja cerrada y sus tres fotografías. No se ejecutó la suite e2e completa. Cambios locales, sin commit, push ni despliegue.

Para repetir la importación con caché:

```powershell
node scripts/colecciones/obtener-cartas.mjs terastal-festival-ex ninja-spinner nihil-zero mega-symphonia pokemon-card-151
node scripts/colecciones/descargar-imagenes-cartas.mjs terastal-festival-ex ninja-spinner nihil-zero mega-symphonia pokemon-card-151
```

## Fotos pendientes de cajas chinas (revisión del 14/10/2026)
Se revisaron las carpetas originales del dueño (no se usó nada fuera de ellas ni imágenes de terceros).
- **Terastal Gathering (太晶盛聚)** — **mejorada.** La portada era un recorte de 234×440 px; ahora es la foto de la caja en la mano de la misma publicación a 825×1100 px, con la foto con otras cajas y la de apilados como secundarias. Sigue siendo foto de proveedor (referencia). Pendiente: una foto propia o del fabricante de la caja cerrada.
- **Victory Star Guide (胜象星引)** — **sin mejora posible.** La única foto de la caja cerrada en la publicación es de 400×400 px (SKU_16 / Detalle_10, la misma imagen que ya se usa); las otras fotos son del sobre. Pendiente: foto propia o del fabricante de la caja.
- **Gem Pack Vol. 6 (宝石包 VOL.6)** — **sin foto de caja cerrada.** La publicación solo trae un gráfico con la caja dentro de una ilustración (≈ 170×230 px útiles) y gráficos de contenido; se conserva como imagen de presentación del proveedor, rotulada como tal. Una foto de un revendedor de eBay hallada en la búsqueda **no se usó** (no es verificable ni propia). Pendiente: foto propia o del fabricante.

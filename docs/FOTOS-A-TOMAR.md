# Fotos que debería tomar el dueño

Faltan vistas útiles que solo se consiguen con el stock real. Mientras no existan, cada ficha muestra únicamente las fotos de referencia del fabricante, rotuladas como tales. **Nada de esto bloquea el resto del trabajo.**

## Cómo sacarlas
- Con el producto **sellado y sin abrir** (no abras cajas para fotografiar el contenido: «contenido físico» solo si abrís una unidad que no vas a vender).
- Fondo liso claro y luz pareja (de día, cerca de una ventana); sin flash directo ni reflejos sobre el film.
- Cámara paralela al producto, sin deformar; que el producto ocupe buena parte del cuadro. **Mínimo 1600 px del lado mayor**, formato JPG o WebP, sin filtros ni retoques de color.
- Sin cartas, accesorios ni otros productos en la foto (salvo que sea la vista «contenido»).

## Lista por producto (las 8 cajas y los 8 sobres)
**Caja (8 SKU: `SV11B`, `SV11W`, `SV9A`, `M2`, `M2A`, `M6A`, `M6`, `M5` + `-JP-BOX`)**
1. Frente.
2. Dorso (donde figura el código, la cantidad de sobres y la información del fabricante).
3. Lateral izquierdo y lateral derecho.
4. Parte superior y base.
5. Detalle del film / sello (que se vea que está sellada) y de las solapas.
6. Detalle del código de barras o la etiqueta del idioma.
7. Si corresponde, **la unidad exacta que vendés** (por si el estado de esquinas o film difiere de la de referencia).

**Sobre individual (8 SKU: mismos códigos + `-JP-BOOSTER`)**
1. Frente y dorso.
2. Detalle del sellado superior e inferior (bordes).
3. Detalle del código/etiqueta si lo tiene.

> Los sobres de Black Bolt, White Flare e Inferno X tienen hoy una foto oficial de baja resolución (≈ 264–278 px de ancho): son los que más se benefician de una foto propia.

## Lote chino (36 fichas, SKU `ZH-…`)
Mismas reglas de arriba. Prioridad: **宝石包 VOL.6** y el **Vol.3** de 最初的伙伴 (hoy solo tienen una imagen de presentación del proveedor), las cajas de 胜象星引 y 暗影夺辉 (foto pequeña) y **cualquier sobre/caja que vendas realmente**: las fotos actuales son de proveedores. Lista completa de SKU en [IMPORTACION-CHINA.md](IMPORTACION-CHINA.md).

## Cómo cargarlas (sin tocar componentes)
1. Guardá los archivos en `public/images/tienda/<SKU>/` con nombres claros (`frente.webp`, `dorso.webp`…).
2. Agregá una entrada por foto en `src/content/real/store-photos.json`, por SKU (en orden de aparición):

```json
{
  "photos": {
    "M6-JP-BOX": [
      { "file": "/images/tienda/M6-JP-BOX/frente.webp", "width": 1600, "height": 1200, "view": "front", "alt": "Frente de la caja de Storm Emeralda del stock de la tienda", "takenAt": "2026-11-02" }
    ]
  }
}
```
   `view` puede ser `front`, `back`, `left`, `right`, `top`, `bottom`, `detail` o `contents`.
3. Corré `npm run catalog:check` (verifica que el archivo exista y cumpla el esquema) y mirá la ficha: aparecen a continuación de las del fabricante, con la etiqueta «Foto real del stock de la tienda».

Las fotos propias quedan registradas con origen «Foto propia de la tienda, tomada el <fecha>» y estado final (no requieren permiso de terceros).

## Nota de la tanda 4 (13/10/2026)

Del material del proveedor, **太晶盛聚 (caja)** solo tiene fotos de baja resolución (la principal es un recorte de un envase de una foto de varias unidades) y **宝石包 VOL.6 (caja)** no tiene ninguna foto limpia de la caja (la primera imagen son los sobres que trae). Son las dos fichas chinas donde una foto propia del stock real (frente cerrado, dorso y laterales, con fondo liso) mejoraría más la ficha.


## Tanda 6 (14/10/2026): fotos que faltan o se pueden mejorar

Se revisó todo el material local (carpetas de Tmall/Taobao) buscando más vistas de cajas. Se **sumaron** 4 fotos de contenido documentado a las dos cajas especiales de Ogerpon (accesorios y sobre «北上乡专题包»). Lo que **sigue faltando** (no hay imágenes adecuadas en el material local y no se rellenó con repetidas ni de otra edición):

- **Cajas chinas con una sola foto:** 璀璨诡幻/胜象星引 (ZH-975082756071-SKU16 y SKU18). Las otras imágenes de la publicación (`Detalle_10`, `Detalle_12`, `Principal_04`) son la misma foto o la misma caja: no hay una segunda vista.
- **宝石包 VOL.6 (ZH-1070975018438):** no existe una foto limpia de la caja cerrada (solo arte promocional con la caja chica); la primera imagen sigue siendo los sobres.
- **太晶盛聚 (ZH-1064307763243):** sin foto de la caja en alta resolución.
- **Cajas japonesas (8):** tienen caja cerrada + caja abierta de exhibición (rotulada como referencia de exhibición, no como el estado de una caja cerrada vendida). Faltan vistas laterales/dorso y el contenido físico.
- **Sobres (japoneses y chinos):** una sola vista frontal cada uno.
- **Bulbasaur:** solo la imagen del envase del proveedor.
- **Todos los productos:** **fotos de tu stock real** (frente, dorso, laterales y precinto). Subilas desde `/admin` → Editar ficha → Fotos, marcadas como «mi stock real».

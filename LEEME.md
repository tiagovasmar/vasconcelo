# Kit para construir tu tienda Pokémon con Claude Code

Este paquete contiene el encargo, las reglas de trabajo y las referencias visuales aprobadas. No es todavía la aplicación.

## Cómo empezar

1. Extraé el ZIP en una carpeta nueva, por ejemplo `tienda-pokemon`.
2. Abrí **esa carpeta** con Claude Code. Conservá `CLAUDE.md`, `PROYECTO.md`, `DISENO.md`, `.claude/` y `referencias/` juntos.
3. Pegá el mensaje de `EMPEZAR.md`. Claude debe construir y probar la primera sección antes de pedirte que la revises.
4. Al terminar cada hito, indicá los ajustes o respondé `Aprobado, seguí con el próximo hito`.

No hace falta elegir hosting, crear GitHub ni aportar un teléfono para empezar en local. Las consultas reales por WhatsApp requieren tu número antes de habilitarlas.

## Qué contiene

- `CLAUDE.md`: instrucciones permanentes, autonomía, Git y momentos de revisión.
- `PROYECTO.md`: funciones, arquitectura, datos, pruebas y entregas.
- `DISENO.md`: dirección visual aprobada y cómo implementarla.
- `EMPEZAR.md`: mensaje inicial para Claude.
- `.claude/settings.json`: edición automática y permisos acotados para comandos frecuentes.
- `referencias/01-inicio-aprobado.png`: inicio aprobado.
- `referencias/02-catalogo-aprobado.png`: catálogo aprobado.
- `referencias/03-producto-aprobado.png`: ficha de producto aprobada.
- `referencias/04-carrito-aprobado.png`: carrito aprobado de la primera propuesta.
- `FUENTES.md`: referencias de diseño y documentación técnica consultada.

## Qué está decidido

Tienda de un único vendedor, sobres y packs Pokémon sellados, Argentina, pesos argentinos, Andreani, moto en CABA/AMBA y retiro en Ramos Mejía/Haedo. Carrito con resumen para WhatsApp, cuentas opcionales, catálogo administrado mediante código, sin panel de productos y sin pasarela de pago. Primero local; hosting después. Revisiones por sección completa, no por cambio pequeño.

El diseño japonés elaborado de las imágenes está aprobado. El nombre `TU TIENDA`, precios, textos de producto y envases de los bocetos son ejemplos; no son un catálogo comercial validado. Las cartas de las imágenes también son ilustrativas.

## Cómo se reduce la cantidad de confirmaciones

El archivo `.claude/settings.json` usa `acceptEdits` y autoriza comandos habituales de instalación, pruebas y Git. Las instrucciones piden trabajar hasta terminar cada hito y hacer commits sin consultarte por cada archivo. Los pushes se hacen a la rama de trabajo del repositorio que vos conectes, sin publicar la web.

Claude puede pedirte inicialmente que confíes en la carpeta. Sus permisos de herramienta, las políticas de tu equipo o un comando no contemplado pueden requerir otra aprobación: el texto de un prompt no anula esos controles. No se usa un modo de omitir todos los permisos. Si ya tenés configuración propia, pedile que la combine, no que la reemplace.

Los pushes automáticos no habilitan despliegues automáticos. La publicación seguirá esperando tu aprobación.

## Datos que completarás más adelante

Nombre y logo definitivos; número de WhatsApp; productos, fotos, stock y precios reales; métodos de pago que aceptás; condiciones de entrega y retiro; datos del comercio y textos finales; dominio, hosting y correo para las cuentas en producción. Claude debe avanzar con configuración de ejemplo y agrupar estos pendientes al final, sin preguntártelos repetidamente.

Las referencias externas y las opciones de permisos se consultaron el 12 de octubre de 2026. Claude debe verificar compatibilidad con la versión instalada antes de configurar dependencias.

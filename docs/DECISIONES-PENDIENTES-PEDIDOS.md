# Decisiones comerciales pendientes (pedidos, encargos y mayoristas)

Nada de esto se inventó: los campos existen, están vacíos o con una **decisión de trabajo marcada** y no se publican como condiciones reales hasta que el dueño las confirme. Se agrupan para responder de una vez.

## A. Mayoristas (el catálogo no se puede abrir sin los puntos 1 a 4)
1. **Compra mínima**: ¿en unidades, en pesos o ambas? ¿Cuánto?
2. **Combinación de productos**: ¿las unidades de distintos productos suman para alcanzar el mínimo y cada tramo (`pedido`) o cada producto llega a su propio tramo (`producto`)?
3. **Escalas**: desde qué cantidades hay cada tramo y el precio unitario de cada uno, por producto. (La referencia `costo final × 1,5` ya está en el panel; hacen falta compras confirmadas para verla.)
4. **Demoras estimadas** y **desde qué momento se cuentan** (por ejemplo, desde la confirmación de la seña). Sin fechas garantizadas.
5. **Moneda de los precios por tramo**: hoy se cargan en **USD** (como el catálogo) y se muestran en pesos con la conversión del sitio. ¿Lo preferís en pesos fijos?
6. **Financiación a 3 o 6 meses**: hoy solo se informa que se puede consultar. ¿Hay algo más para publicar? (No se prometieron aprobación, cuotas ni tasas.)

## B. Encargos y reintegros
7. **Pago antes de entregar**: hoy el servidor exige el **pago completo** (seña + 80%) confirmado antes de despachar, dejar listo para retirar o entregar *cualquier* parte de un encargo o pedido mayorista. Con entregas parciales, ¿se cobra todo antes de la primera entrega o proporcional a lo entregado?
8. **Plazo de reintegro de la seña** cuando el paquete se pierde o un problema impide cumplir el encargo. (Hoy el texto dice que «se reintegra la seña» sin plazo.)
9. **Cancelaciones voluntarias**: ¿la seña se devuelve, se pierde o se devuelve parcialmente? Hoy no hay ninguna regla escrita.
10. **Encargos sin vencimiento**: confirmado que no hay cotizaciones con vencimiento; ¿hay un tiempo máximo para pagar la seña tras confirmar el importe?

## C. Costos y ganancia
11. **Método de costo**: hoy el costo de una venta es el **promedio ponderado de las compras confirmadas** al momento de venderla. ¿Preferís otro criterio (por lote / el último costo / FIFO)?
12. **Comisiones**: hoy se cargan a mano por venta. ¿Hay comisiones fijas (cobro con tarjeta, plataforma) que convenga calcular solas?
13. **Ventas anteriores**: no tienen costo y figuran «Costo pendiente»; se completan una por una (o con el promedio) desde Costos. ¿Querés cargar costos históricos?

## D. Avisos y cuentas
14. **Invitados**: no dejan correo, así que no reciben avisos (ven el estado por el navegador o por el enlace privado que les compartís). ¿Querés pedir un correo opcional al comprar como invitado?
15. **Google**: crear el proyecto y las credenciales (ver [GOOGLE.md](GOOGLE.md)); confirmar el nombre de la app, el correo de soporte y el logotipo.
16. **Textos legales**: actualizar la política de privacidad y las condiciones (Google, comprobantes de transferencia, avisos por correo, consentimiento de reposición, condiciones de seña y reintegro). Siguen siendo borradores del proyecto.
17. **Remitente de correo verificado** (dominio propio) para los avisos reales: sin esto no sale ningún correo en producción.

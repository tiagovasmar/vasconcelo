import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { legal, orPending } from "@/content/legal";
import { store } from "@/content/store";

export const metadata: Metadata = { title: "Condiciones (borrador)", description: "Cómo funciona la tienda y qué condiciones aplican. Borrador sujeto a revisión del comercio." };

export default function Condiciones() {
  return (
    <LegalPage
      eyebrow="Legal · Borrador"
      title="Condiciones."
      intro="Cómo funciona esta tienda, en pocas palabras. Lo que depende de decisiones del comercio figura como pendiente."
      sections={[
        {
          id: "que-es",
          title: "Qué es este sitio",
          body: <p>{store.name} es un catálogo de productos Pokémon TCG sellados con un carrito para preparar consultas. <b>No se vende ni se cobra dentro del sitio</b>: no hay pagos en línea. Una consulta es un pedido armado para conversar con la tienda por WhatsApp.</p>,
        },
        {
          id: "proceso",
          title: "Cómo se concreta una compra",
          body: (
            <ol className="list-decimal space-y-1 pl-5">
              <li>Armás el carrito y elegís entrega y preferencia de pago.</li>
              <li>Preparás la consulta y, si querés, abrís WhatsApp con el pedido escrito.</li>
              <li>La tienda te confirma disponibilidad, importe final, pago y entrega en el chat.</li>
              <li>Recién ahí queda acordada la operación. Preparar la consulta o abrir WhatsApp no confirma pago, reserva ni venta.</li>
            </ol>
          ),
        },
        {
          id: "precios",
          title: "Precios, stock y disponibilidad",
          body: <p>Los precios y el stock se actualizan manualmente y pueden cambiar. Por eso el sitio muestra un «subtotal de productos» y deja el envío «a coordinar»: el importe final se confirma por WhatsApp. No hay reserva de stock al preparar una consulta.</p>,
        },
        {
          id: "contenido",
          title: "Contenido aleatorio e información de cartas",
          body: <p>El contenido de los sobres es aleatorio. La información de cartas, probabilidades y garantías es informativa, indica su fuente y la fecha de revisión, y solo se muestra cuando existe evidencia aplicable al producto, idioma y región. Cuando un dato no está disponible, lo decimos. En las cajas distinguimos el contenido físico confirmado, las rarezas garantizadas que una fuente documente (si ninguna lo hace, figura «sin confirmación documental», que no significa que no haya un patrón habitual) y, si existiera, la composición observada, que es una estimación y no una garantía. Este sitio no es una tienda ni un sitio oficial de Pokémon.</p>,
        },
        {
          id: "entregas",
          title: "Entregas, retiros y pagos",
          body: <p>Andreani a todo el país, moto en CABA y AMBA (cobertura a confirmar) y retiro en Ramos Mejía o Haedo. Costos, plazos, puntos de retiro y medios de pago se acuerdan por WhatsApp. No pedimos datos bancarios en el sitio.</p>,
        },
        {
          id: "cambios",
          title: "Cambios, devoluciones y garantías",
          body: <p>{orPending(legal.returnsPolicy)}</p>,
        },
        {
          id: "cuentas",
          title: "Cuentas",
          body: <p>Tener una cuenta es opcional. Sos responsable de mantener tu contraseña en reserva. Podés pedir la baja de tu cuenta escribiendo a {orPending(legal.contactEmail)}.</p>,
        },
        {
          id: "marcas",
          title: "Marcas y propiedad intelectual",
          body: <p>Pokémon y sus personajes son marcas de sus respectivos titulares. Las imágenes de los productos son fotos de referencia del fabricante o de proveedores de artículos identificados; todavía no son fotos del stock de la tienda ni acreditan el estado de cada unidad. No afirmamos que se hayan verificado licencias de uso de esas imágenes. Las cartas que se muestran son ilustrativas de la expansión y no se venden sueltas.</p>,
        },
        {
          id: "datos",
          title: "Titular, ley aplicable y jurisdicción",
          body: (
            <ul className="list-disc space-y-1 pl-5">
              <li>Titular: {orPending(legal.legalName)} · CUIT/CUIL: {orPending(legal.taxId)}</li>
              <li>Domicilio: {orPending(legal.address)}</li>
              <li>Ley aplicable y jurisdicción: {orPending(legal.jurisdiction)}</li>
            </ul>
          ),
        },
      ]}
    />
  );
}

import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { legal, orPending } from "@/content/legal";
import { store } from "@/content/store";

export const metadata: Metadata = { title: "Privacidad (borrador)", description: "Qué datos usa este sitio y para qué. Borrador sujeto a revisión del comercio." };

export default function Privacidad() {
  return (
    <LegalPage
      eyebrow="Legal · Borrador"
      title="Privacidad."
      intro="Acá explicamos, en palabras simples, qué datos usa este sitio, para qué y qué no hace con ellos."
      sections={[
        {
          id: "responsable",
          title: "Quién es responsable",
          body: (
            <ul className="list-disc space-y-1 pl-5">
              <li>Comercio: {store.name} (nombre comercial; razón social y datos legales pendientes de cargar)</li>
              <li>Titular: {orPending(legal.legalName)}</li>
              <li>CUIT/CUIL: {orPending(legal.taxId)}</li>
              <li>Domicilio: {orPending(legal.address)}</li>
              <li>Contacto por temas de privacidad: {orPending(legal.contactEmail)}</li>
            </ul>
          ),
        },
        {
          id: "datos",
          title: "Qué datos usamos",
          body: (
            <>
              <p><b>Si no tenés cuenta</b> y preparás una consulta: los productos y cantidades, la modalidad de entrega y los datos mínimos que elegís para coordinarla (localidad, provincia y código postal si es Andreani; localidad y código postal si es moto; si retirás, no pedimos más datos de entrega), tu nombre y apellido (obligatorio para preparar la consulta) y la preferencia de pago. No pedimos DNI, dirección completa ni datos bancarios.</p>
              <p><b>Si creás una cuenta:</b> tu nombre, tu correo y tu contraseña (que se guarda cifrada con un hash, nunca en texto plano), tus favoritos y las consultas que asociás a tu cuenta.</p>
              <p><b>Si solicitás una cuenta mayorista:</b> además guardamos el nombre comercial o actividad, la localidad y la provincia, la nota opcional sobre artículos o volumen de interés, la fecha y el estado de la solicitud (pendiente, aprobada o rechazada). No pedimos documentos ni identificaciones.</p>
              <p><b>Si consultás por encargo:</b> los productos y cantidades que pedís cotizar se guardan como parte de tu consulta, sin precio hasta que la tienda cotice.</p>
            </>
          ),
        },
        {
          id: "para-que",
          title: "Para qué los usamos",
          body: <p>Para armar el resumen de tu consulta, que puedas copiarlo o abrirlo en WhatsApp, y para que la tienda pueda confirmarte disponibilidad, importe final, pago y entrega. Con una cuenta, además, para que veas «Mis consultas» y tus favoritos, y para enviarte los correos de confirmación y de recuperación de acceso. Si pedís una cuenta mayorista, para que la tienda evalúe tu solicitud y puedas ver su estado en «Mi cuenta».</p>,
        },
        {
          id: "cookies",
          title: "Cookies y almacenamiento en tu navegador",
          body: (
            <>
              <p>Usamos solo lo imprescindible para que el sitio funcione:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li><b>Carrito:</b> se guarda en el almacenamiento local de tu navegador (productos, cantidades y, si lo completás, los datos de entrega del formulario). Al cerrar sesión se borran el nombre y los datos de entrega.</li>
                <li><b>Sesión de invitado:</b> una cookie técnica que permite que solo tu navegador vea las consultas que preparó.</li>
                <li><b>Sesión de cuenta:</b> una cookie técnica que mantiene tu sesión iniciada.</li>
              </ul>
              <p>No usamos analítica de terceros, publicidad ni cookies de seguimiento.</p>
            </>
          ),
        },
        {
          id: "whatsapp",
          title: "WhatsApp",
          body: <p>Preparar una consulta no envía nada. Cuando tocás «Continuar por WhatsApp» se abre el chat con tu pedido escrito y vos decidís si lo enviás. Desde ese momento rigen las políticas de WhatsApp. Este sitio no usa la API de WhatsApp Business ni envía mensajes por su cuenta.</p>,
        },
        {
          id: "conservacion",
          title: "Cuánto tiempo los conservamos",
          body: <p>{orPending(legal.dataRetention)}</p>,
        },
        {
          id: "derechos",
          title: "Tus derechos y cómo ejercerlos",
          body: <p>Podés pedir acceso, corrección o eliminación de tus datos escribiendo a: {orPending(legal.contactEmail)}. Los procedimientos y plazos los define el comercio con asesoramiento legal antes de publicar.</p>,
        },
      ]}
    />
  );
}

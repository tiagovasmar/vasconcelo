import type { WholesaleRequestView } from "@/features/wholesale/service";

const fmt = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));

export const wholesaleStatusText = {
  pendiente: { label: "Pendiente de revisión", body: "Recibimos tu solicitud. La tienda la revisa a mano; hasta que la apruebe no ves precios mayoristas." },
  aprobada: { label: "Aprobada", body: "Tu cuenta fue aprobada. Los precios mayoristas se ven en el catálogo mayorista cuando la tienda lo habilita (compra mínima y demoras a definir por la tienda)." },
  rechazada: { label: "No aprobada", body: "La tienda no aprobó esta solicitud. Si querés más información, consultá con la tienda por WhatsApp." },
} as const;

/** Estado de la solicitud mayorista (solo lectura): nunca presenta la solicitud como un descuento activo. */
export function WholesaleStatusCard({ request }: { request: WholesaleRequestView }) {
  const t = wholesaleStatusText[request.status];
  return (
    <div role="status" className="border-l-4 border-emerald bg-emerald/10 p-4 text-sm" data-testid="estado-mayorista">
      <p className="text-base font-bold">Solicitud de cuenta mayorista: <span data-testid="estado-mayorista-texto">{t.label}</span></p>
      <p className="mt-2">{t.body}</p>
      <dl className="mt-3 space-y-1 text-xs text-ink/75">
        <div className="flex gap-2"><dt className="font-semibold">Referencia:</dt><dd>{request.reference}</dd></div>
        <div className="flex gap-2"><dt className="font-semibold">Nombre comercial o actividad:</dt><dd>{request.businessName}</dd></div>
        <div className="flex gap-2"><dt className="font-semibold">Ubicación:</dt><dd>{request.locality}, {request.province}</dd></div>
        <div className="flex gap-2"><dt className="font-semibold">Enviada el:</dt><dd>{fmt(request.createdAt)}</dd></div>
      </dl>
    </div>
  );
}

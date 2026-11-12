import Link from "next/link";
import type { WholesaleRequestView } from "@/features/wholesale/service";

const fmt = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));

export const wholesaleStatusText = {
  pendiente: { label: "Pendiente de revisión", body: "La solicitud quedó registrada en el panel de la tienda. Podés volver a Mi cuenta para ver el estado. Hasta que la tienda la apruebe no ves precios mayoristas." },
  aprobada: { label: "Aprobada", body: "Tu cuenta fue aprobada. Podés ver los precios y hacer pedidos cuando el catálogo mayorista esté abierto." },
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
      {request.status === "aprobada" && <Link href="/mayoristas/catalogo" className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Ir al catálogo mayorista</Link>}
    </div>
  );
}

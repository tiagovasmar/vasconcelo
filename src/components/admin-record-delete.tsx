import { AdminButton } from "./admin-form";
import type { RecordKind } from "@/features/admin/record-archives";

export function AdminRecordDelete({ kind, recordId, archived = false }: { kind: RecordKind; recordId: string; archived?: boolean }) {
  return <AdminButton endpoint="/api/admin/registros" body={{ kind, recordId, archived: !archived }}
    label={archived ? "Restaurar" : "Eliminar de la lista"} danger={!archived}
    confirmText={archived ? "¿Restaurar este registro en la lista principal?" : `¿Quitar este registro de la lista principal? Podrás recuperarlo desde Eliminados.${kind === "wholesale" ? " El pedido dejará de sumar en el resumen y el gráfico." : ""} No se anulan pagos, ventas ni movimientos de stock.`}
    ok={archived ? "Registro restaurado." : "Movido a Eliminados. El historial se conserva."} />;
}

import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { adminSettings, costPurchaseItems, importAllocations, importParcels, inquiries, inquiryLines, notificationOutbox, orderEvents, paymentReceipts, restockAlerts, sales, shipments, wholesaleRequests } from "@/db/schema";

export const NOTICE_PAGE_SIZE = 25;

// Los avisos salen de las operaciones guardadas. La lectura de cada aviso se guarda aparte.
const events = sql`
  with events as (
    select 'venta:' || id as key, 'venta' as kind, id as ref, created_at as at, null::text as detail, total_minor as amount
    from ${sales}
    union all
    select 'anulacion:' || id, 'anulacion', id, voided_at, null, total_minor
    from ${sales} where voided_at is not null
    union all
    select 'consulta:' || i.id,
      case when i.order_kind = 'mayorista' then 'pedido_mayorista'
           when i.payment_preference = 'preventa' then 'preventa'
           when exists (select 1 from ${inquiryLines} l where l.inquiry_id = i.id and l.fulfillment = 'encargo') then 'encargo'
           else 'consulta' end,
      i.id, i.created_at, i.contact_name, null
    from ${inquiries} i where i.source = 'web'
    union all
    select 'mayorista:' || id, 'mayorista', id, created_at, business_name, null
    from ${wholesaleRequests}
    union all
    select 'comprobante:' || id, 'comprobante', inquiry_id, created_at, null, null
    from ${paymentReceipts}
    union all
    select 'retiro:' || e.id, 'retiro', e.inquiry_id, e.created_at, null, null
    from ${orderEvents} e
    where e.stage = 'listo_retiro' and e.kind = 'stage'
    union all
    select 'recepcion:' || sh.id || ':' || item.purchase_id, 'recepcion', item.purchase_id,
      coalesce(sh.arrived_at, sh.updated_at), sh.label, null
    from ${importParcels} p
      inner join ${shipments} sh on sh.id = p.shipment_id
      inner join ${importAllocations} a on a.id = p.allocation_id
      inner join ${costPurchaseItems} item on item.id = a.item_id
    where sh.status = 'recibido_argentina' and p.quantity > p.accepted + p.missing + p.damaged
    group by sh.id, item.purchase_id
    union all
    select 'reposicion:' || id, 'reposicion', product_id, created_at, null, null
    from ${restockAlerts} where status = 'activo'
    union all
    select 'correo:' || id, 'correo', id::text, created_at, subject, null
    from ${notificationOutbox} where status = 'fallido'
  )
`;

const readPrefix = (userId: string) => `admin.notice.read:${userId}:`;
const readJoin = (userId: string) => sql`left join ${adminSettings} seen on seen.key = ${readPrefix(userId)} || e.key`;

export type NoticeKind = "venta" | "anulacion" | "consulta" | "encargo" | "pedido_mayorista" | "preventa" | "mayorista" | "comprobante" | "retiro" | "recepcion" | "reposicion" | "correo";
type NoticeRow = { key: string; kind: NoticeKind; ref: string; at: string; detail: string | null; amount: string | null; unread: boolean };

export async function countUnreadAdminNotices(db: Db, userId: string): Promise<number> {
  const [row] = await db.execute<{ count: number }>(sql`
    ${events}
    select count(*)::int as count from events e ${readJoin(userId)} where seen.key is null
  `);
  return row.count;
}

export async function listAdminNotices(db: Db, userId: string, opts: { unread: boolean; page: number }) {
  const rows = await db.execute<NoticeRow>(sql`
    ${events}
    select e.*, seen.key is null as unread from events e ${readJoin(userId)}
    ${opts.unread ? sql`where seen.key is null` : sql``}
    order by e.at desc, e.key desc limit ${NOTICE_PAGE_SIZE + 1} offset ${(opts.page - 1) * NOTICE_PAGE_SIZE}
  `);
  return {
    hasMore: rows.length > NOTICE_PAGE_SIZE,
    rows: rows.slice(0, NOTICE_PAGE_SIZE).map((row) => ({ ...row, at: Number(row.at), amount: row.amount === null ? null : Number(row.amount) })),
  };
}

export async function markAdminNoticesRead(db: Db, actor: { id: string; email: string }, keys: string[]) {
  if (!keys.length) return;
  await db.execute(sql`
    ${events}
    insert into ${adminSettings} (key, value, updated_at, updated_by_email)
    select ${readPrefix(actor.id)} || e.key, '1', ${Date.now()}, ${actor.email}
    from events e where e.key in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
    on conflict (key) do nothing
  `);
}

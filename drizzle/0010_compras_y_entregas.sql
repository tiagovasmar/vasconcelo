ALTER TABLE "sales" ADD COLUMN "scheduled_for" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "customer_contact" text;--> statement-breakpoint
ALTER TABLE "cost_purchases" ADD COLUMN "rmb_per_usd_10k" bigint;--> statement-breakpoint
ALTER TABLE "cost_purchases" ADD COLUMN "usd_to_ars_10k" bigint;--> statement-breakpoint
ALTER TABLE "cost_purchases" ADD COLUMN "paid_usd_minor" bigint;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "venta_solo_se_anula"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una venta no se borra: anulala para devolver el stock.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status = 'agendada' AND NEW.status = 'registrada' AND NEW.sold_on IS NOT NULL AND NEW.payment_method <> 'pendiente'
     AND (to_jsonb(NEW) - ARRAY['status', 'sold_on', 'payment_method', 'received_minor', 'installments'])
       = (to_jsonb(OLD) - ARRAY['status', 'sold_on', 'payment_method', 'received_minor', 'installments']) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('registrada', 'agendada') AND NEW.status = 'anulada'
     AND (to_jsonb(NEW) - ARRAY['status', 'voided_at', 'voided_by_email', 'void_reason'])
       = (to_jsonb(OLD) - ARRAY['status', 'voided_at', 'voided_by_email', 'void_reason']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Una venta no se edita. Las entregas agendadas pueden confirmarse y las ventas vigentes pueden anularse.' USING ERRCODE = 'integrity_constraint_violation';
END
$$;

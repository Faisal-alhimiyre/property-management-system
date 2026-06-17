-- notifications_context_2026.sql
-- Purpose:
-- - Keep public.maintenance_requests as workflow/state table.
-- - Use public.notifications as inbox delivery table with context fields.

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS kind varchar(50),
ADD COLUMN IF NOT EXISTS event_type varchar(100),
ADD COLUMN IF NOT EXISTS source_table varchar(64),
ADD COLUMN IF NOT EXISTS source_id bigint,
ADD COLUMN IF NOT EXISTS contract_id integer,
ADD COLUMN IF NOT EXISTS maintenance_request_id integer,
ADD COLUMN IF NOT EXISTS apartment_id integer,
ADD COLUMN IF NOT EXISTS apartment_number varchar(50),
ADD COLUMN IF NOT EXISTS building_id integer,
ADD COLUMN IF NOT EXISTS building_name varchar(255),
ADD COLUMN IF NOT EXISTS building_number varchar(50),
ADD COLUMN IF NOT EXISTS amount numeric,
ADD COLUMN IF NOT EXISTS due_date date,
ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_kind_created
  ON public.notifications (kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_source
  ON public.notifications (source_table, source_id);

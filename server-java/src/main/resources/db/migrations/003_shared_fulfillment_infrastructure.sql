-- Shared reliability infrastructure for sales and inventory fulfillment.
BEGIN;

CREATE OR REPLACE FUNCTION fulfill_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE fulfill_idempotency_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL,
  command_type text NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL,
  response_status integer NOT NULL, response_body jsonb NOT NULL, aggregate_type text,
  aggregate_id uuid, trace_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, command_type, idempotency_key)
);

CREATE TABLE fulfill_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL,
  aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, aggregate_version bigint NOT NULL,
  root_sales_order_id uuid,
  from_status text, to_status text NOT NULL, reason text, actor_id text NOT NULL,
  correlation_id uuid NOT NULL, trace_id text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fulfill_audit_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL,
  aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, aggregate_version bigint NOT NULL,
  action text NOT NULL, actor_id text NOT NULL, before_snapshot jsonb, after_snapshot jsonb,
  reason text, permission_version text NOT NULL, correlation_id uuid NOT NULL, trace_id text NOT NULL,
  ip_address text, user_agent text, occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fulfill_event_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL,
  consumer_name text NOT NULL, event_id uuid NOT NULL, event_type text NOT NULL,
  event_version integer NOT NULL, aggregate_type text NOT NULL, aggregate_id text NOT NULL,
  aggregate_version bigint NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'RECEIVED',
  retry_count integer NOT NULL DEFAULT 0, last_error text, received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz, UNIQUE (tenant_id, consumer_name, event_id),
  CHECK (status IN ('RECEIVED','PROCESSING','PROCESSED','RETRY_WAIT','DEAD_LETTER'))
);

CREATE TABLE fulfill_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL,
  event_id uuid NOT NULL, event_type text NOT NULL, event_version integer NOT NULL,
  aggregate_type text NOT NULL, aggregate_id text NOT NULL, aggregate_version bigint NOT NULL,
  correlation_id uuid NOT NULL, causation_id uuid, trace_id text NOT NULL,
  payload jsonb NOT NULL, status text NOT NULL DEFAULT 'PENDING', attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, event_id),
  CHECK (status IN ('PENDING','PUBLISHING','PUBLISHED','RETRY_WAIT','DEAD_LETTER'))
);

CREATE TABLE fulfill_compensation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL,
  compensation_no text NOT NULL, aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
  action_type text NOT NULL, reason text NOT NULL, status text NOT NULL DEFAULT 'PENDING_REVIEW',
  requested_by text NOT NULL, approved_by text, executed_by text, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_version bigint NOT NULL DEFAULT 1, correlation_id uuid NOT NULL, trace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, compensation_no), UNIQUE (tenant_id, id),
  CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED','EXECUTING','SUCCEEDED','FAILED'))
);

CREATE INDEX fulfill_history_aggregate_idx ON fulfill_status_history (tenant_id, aggregate_type, aggregate_id, occurred_at);
CREATE INDEX fulfill_history_order_idx ON fulfill_status_history (tenant_id, root_sales_order_id, occurred_at);
CREATE INDEX fulfill_audit_aggregate_idx ON fulfill_audit_snapshot (tenant_id, aggregate_type, aggregate_id, occurred_at);
CREATE INDEX fulfill_outbox_poll_idx ON fulfill_event_outbox (status, available_at, created_at);
CREATE INDEX fulfill_inbox_retry_idx ON fulfill_event_inbox (status, received_at);

CREATE TRIGGER fulfill_compensation_touch BEFORE UPDATE ON fulfill_compensation
FOR EACH ROW EXECUTE FUNCTION fulfill_touch_updated_at();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'fulfill_idempotency_record','fulfill_status_history','fulfill_audit_snapshot',
    'fulfill_event_inbox','fulfill_event_outbox','fulfill_compensation'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', table_name || '_tenant_policy', table_name);
  END LOOP;
END $$;

COMMIT;

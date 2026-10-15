-- Shared PostgreSQL persistence for the finance / message / AI / personnel /
-- supply-chain / platform modules. Business documents are stored as JSONB
-- aggregates keyed by (module, tenant, kind, id); infra tables handle outbox,
-- audit and idempotency records for every module.
BEGIN;

CREATE TABLE IF NOT EXISTS module_document (
  module text NOT NULL,
  tenant_id text NOT NULL,
  kind text NOT NULL,
  doc_id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module, tenant_id, kind, doc_id)
);

CREATE INDEX IF NOT EXISTS module_document_list_idx
  ON module_document (module, tenant_id, kind, (data->>'createdAt') DESC);

CREATE TABLE IF NOT EXISTS module_outbox_event (
  module text NOT NULL,
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module, tenant_id, event_id),
  CHECK (status IN ('PENDING', 'PUBLISHED', 'DEAD_LETTER'))
);

CREATE INDEX IF NOT EXISTS module_outbox_pending_idx
  ON module_outbox_event (module, tenant_id, status);

CREATE TABLE IF NOT EXISTS module_audit_log (
  module text NOT NULL,
  log_id text NOT NULL,
  tenant_id text NOT NULL,
  data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module, log_id)
);

CREATE INDEX IF NOT EXISTS module_audit_lookup_idx
  ON module_audit_log (module, tenant_id, occurred_at);

CREATE TABLE IF NOT EXISTS module_idempotency_record (
  module text NOT NULL,
  tenant_id text NOT NULL,
  command_type text NOT NULL,
  idempotency_key text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module, tenant_id, command_type, idempotency_key)
);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'module_document', 'module_outbox_event', 'module_audit_log', 'module_idempotency_record'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_tenant_policy', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      tbl || '_tenant_policy', tbl
    );
  END LOOP;
END $$;

COMMIT;

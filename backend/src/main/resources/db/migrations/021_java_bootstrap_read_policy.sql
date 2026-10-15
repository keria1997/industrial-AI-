-- Java JSONB stores must load module snapshots at startup and discover all
-- pending tenants. This narrow bootstrap policy is enabled only by the API.
BEGIN;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'module_document', 'module_outbox_event', 'module_audit_log', 'module_idempotency_record'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_java_bootstrap_policy', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
       USING (current_setting(''app.bootstrap_mode'', true) = ''true'')
       WITH CHECK (current_setting(''app.bootstrap_mode'', true) = ''true'')',
      tbl || '_java_bootstrap_policy', tbl
    );
  END LOOP;
END $$;

COMMIT;

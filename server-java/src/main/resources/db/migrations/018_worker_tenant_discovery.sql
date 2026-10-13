-- The background worker discovers tenants with pending outbox events across
-- all tenants. It runs under the dedicated `infra` tenant context, which gets
-- read-only visibility into the outbox tables. WITH CHECK stays strictly
-- tenant-scoped, so the infra context still cannot write cross-tenant rows.
DO $$
BEGIN
  IF to_regclass('prod_event_outbox') IS NOT NULL THEN
    DROP POLICY IF EXISTS tenant_isolation ON prod_event_outbox;
    CREATE POLICY tenant_isolation ON prod_event_outbox
      USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) = 'infra')
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;

  IF to_regclass('fulfill_event_outbox') IS NOT NULL THEN
    DROP POLICY IF EXISTS fulfill_event_outbox_tenant_policy ON fulfill_event_outbox;
    CREATE POLICY fulfill_event_outbox_tenant_policy ON fulfill_event_outbox
      USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) = 'infra')
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;

  IF to_regclass('module_outbox_event') IS NOT NULL THEN
    DROP POLICY IF EXISTS module_outbox_event_tenant_policy ON module_outbox_event;
    CREATE POLICY module_outbox_event_tenant_policy ON module_outbox_event
      USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.tenant_id', true) = 'infra')
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;

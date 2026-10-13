ALTER TABLE prod_demand
  ADD COLUMN reviewer_id text,
  ADD COLUMN approved_by text,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN handler_role text,
  ADD COLUMN handler_id text,
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN mrp_task_id text;

CREATE INDEX IF NOT EXISTS idx_prod_demand_handler
  ON prod_demand (tenant_id, handler_role, accepted_at, status);

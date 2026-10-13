-- Production Management P0 schema (PRD V1.2)
-- PostgreSQL 15+. All business tables are tenant scoped; quantities use decimal(18,6).
BEGIN;

CREATE OR REPLACE FUNCTION prod_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Master data owned by Production. Platform resources are referenced by stable IDs only.
CREATE TABLE prod_bom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL,
  product_id text NOT NULL, name text NOT NULL, version text NOT NULL, status text NOT NULL DEFAULT 'DRAFT',
  valid_from timestamptz, valid_to timestamptz, created_by text NOT NULL, approved_by text,
  row_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, version), CHECK (status IN ('DRAFT','PENDING_APPROVAL','EFFECTIVE','EXPIRED','DISABLED'))
);
CREATE TABLE prod_bom_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, bom_id uuid NOT NULL REFERENCES prod_bom(id),
  line_no integer NOT NULL, component_product_id text NOT NULL, qty decimal(18,6) NOT NULL CHECK (qty > 0),
  uom text NOT NULL, loss_rate decimal(9,6) NOT NULL DEFAULT 0, is_critical boolean NOT NULL DEFAULT false,
  substitute_group text, effective_from timestamptz, effective_to timestamptz, UNIQUE (tenant_id, bom_id, line_no)
);
CREATE TABLE prod_bom_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, bom_id uuid NOT NULL REFERENCES prod_bom(id),
  source_version text NOT NULL, snapshot jsonb NOT NULL, checksum text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, bom_id, source_version, checksum)
);
CREATE TABLE prod_routing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL, product_id text NOT NULL,
  name text NOT NULL, version text NOT NULL, status text NOT NULL DEFAULT 'DRAFT', valid_from timestamptz, valid_to timestamptz,
  created_by text NOT NULL, approved_by text, row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, version), CHECK (status IN ('DRAFT','PENDING_APPROVAL','EFFECTIVE','EXPIRED','DISABLED'))
);
CREATE TABLE prod_routing_step (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, routing_id uuid NOT NULL REFERENCES prod_routing(id),
  sequence_no integer NOT NULL, operation_code text NOT NULL, operation_name text NOT NULL, work_center_resource_id text NOT NULL,
  setup_minutes decimal(12,3) NOT NULL DEFAULT 0, run_minutes_per_unit decimal(12,6) NOT NULL DEFAULT 0,
  transfer_batch_qty decimal(18,6), is_quality_gate boolean NOT NULL DEFAULT false, UNIQUE (tenant_id, routing_id, sequence_no)
);
CREATE TABLE prod_routing_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, routing_id uuid NOT NULL REFERENCES prod_routing(id),
  source_version text NOT NULL, snapshot jsonb NOT NULL, checksum text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, routing_id, source_version, checksum)
);
CREATE TABLE prod_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL, name text NOT NULL,
  factory_resource_id text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Shanghai', status text NOT NULL DEFAULT 'ACTIVE',
  row_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code), CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE prod_shift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, calendar_id uuid NOT NULL REFERENCES prod_calendar(id),
  code text NOT NULL, name text NOT NULL, start_time time NOT NULL, end_time time NOT NULL, crosses_midnight boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, calendar_id, code)
);
CREATE TABLE prod_calendar_slot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, calendar_id uuid NOT NULL REFERENCES prod_calendar(id),
  shift_id uuid REFERENCES prod_shift(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  capacity_factor decimal(9,6) NOT NULL DEFAULT 1, is_working boolean NOT NULL DEFAULT true, reason text,
  CHECK (ends_at > starts_at), UNIQUE (tenant_id, calendar_id, starts_at, ends_at)
);
CREATE TABLE prod_employee_skill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, employee_id text NOT NULL, skill_code text NOT NULL,
  level integer NOT NULL DEFAULT 1, valid_from date NOT NULL, valid_to date, status text NOT NULL DEFAULT 'ACTIVE', evidence_ref text,
  UNIQUE (tenant_id, employee_id, skill_code, valid_from), CHECK (level BETWEEN 1 AND 10), CHECK (status IN ('ACTIVE','SUSPENDED','EXPIRED'))
);
CREATE TABLE prod_routing_step_skill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, routing_step_id uuid NOT NULL REFERENCES prod_routing_step(id),
  skill_code text NOT NULL, minimum_level integer NOT NULL DEFAULT 1, required_headcount integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, routing_step_id, skill_code)
);
CREATE TABLE prod_resource_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, platform_resource_id text NOT NULL,
  resource_type text NOT NULL, calendar_id uuid REFERENCES prod_calendar(id), finite_capacity boolean NOT NULL DEFAULT true,
  parallel_capacity integer NOT NULL DEFAULT 1, efficiency decimal(9,6) NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'ACTIVE',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb, row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, platform_resource_id), CHECK (resource_type IN ('FACTORY','WORKSHOP','LINE','WORK_CENTER','WAREHOUSE'))
);

-- Demand, MPS and MRP.
CREATE TABLE prod_demand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL, source_type text NOT NULL,
  product_id text NOT NULL, product_name text, qty decimal(18,6) NOT NULL CHECK (qty > 0), uom text NOT NULL,
  due_date date NOT NULL, priority integer NOT NULL DEFAULT 50, factory_resource_id text NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED', revision integer NOT NULL DEFAULT 1, correlation_id text NOT NULL,
  block_reasons jsonb NOT NULL DEFAULT '[]'::jsonb, created_by text NOT NULL, row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code), CHECK (priority BETWEEN 1 AND 100),
  CHECK (status IN ('RECEIVED','VALIDATING','PENDING_REVIEW','APPROVED','PLANNED','FULFILLED','BLOCKED','REJECTED','CANCELLED','MERGED'))
);
CREATE TABLE prod_demand_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, demand_id uuid NOT NULL REFERENCES prod_demand(id),
  source_system text NOT NULL, source_type text NOT NULL, source_id text NOT NULL, source_line_id text,
  source_revision integer NOT NULL DEFAULT 1, qty decimal(18,6) NOT NULL CHECK (qty > 0), payload_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, source_system, source_type, source_id, source_line_id, source_revision)
);
CREATE TABLE prod_mps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL, version integer NOT NULL,
  factory_resource_id text NOT NULL, horizon_start date NOT NULL, horizon_end date NOT NULL, status text NOT NULL DEFAULT 'DRAFT',
  freeze_until date, parameters_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, created_by text NOT NULL, approved_by text,
  row_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, version), CHECK (horizon_end >= horizon_start), CHECK (status IN ('DRAFT','CALCULATING','PENDING_APPROVAL','PUBLISHED','FROZEN','SUPERSEDED'))
);
CREATE TABLE prod_mps_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, mps_id uuid NOT NULL REFERENCES prod_mps(id),
  product_id text NOT NULL, bucket_date date NOT NULL, demand_qty decimal(18,6) NOT NULL DEFAULT 0,
  planned_qty decimal(18,6) NOT NULL DEFAULT 0, available_qty decimal(18,6) NOT NULL DEFAULT 0, risk_level text NOT NULL DEFAULT 'NONE',
  UNIQUE (tenant_id, mps_id, product_id, bucket_date)
);
CREATE TABLE prod_mrp_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL, mps_id uuid REFERENCES prod_mps(id),
  task_id uuid, status text NOT NULL DEFAULT 'PENDING', parameters_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz, finished_at timestamptz, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code), CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED'))
);
CREATE TABLE prod_mrp_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, mrp_run_id uuid NOT NULL REFERENCES prod_mrp_run(id),
  product_id text NOT NULL, factory_resource_id text NOT NULL, requirement_date date NOT NULL,
  gross_requirement decimal(18,6) NOT NULL DEFAULT 0, confirmed_supply decimal(18,6) NOT NULL DEFAULT 0,
  net_requirement decimal(18,6) NOT NULL DEFAULT 0, action_type text NOT NULL,
  UNIQUE (tenant_id, mrp_run_id, product_id, requirement_date, action_type)
);
CREATE TABLE prod_mrp_pegging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, mrp_result_id uuid NOT NULL REFERENCES prod_mrp_result(id),
  demand_id uuid NOT NULL REFERENCES prod_demand(id), qty decimal(18,6) NOT NULL CHECK (qty > 0), priority_rank integer NOT NULL,
  UNIQUE (tenant_id, mrp_result_id, demand_id)
);
CREATE TABLE prod_plan_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL, mrp_result_id uuid REFERENCES prod_mrp_result(id),
  order_type text NOT NULL, product_id text NOT NULL, qty decimal(18,6) NOT NULL CHECK (qty > 0), uom text NOT NULL,
  required_date date NOT NULL, status text NOT NULL DEFAULT 'DRAFT', converted_work_order_id uuid,
  row_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code), CHECK (order_type IN ('MAKE','BUY')), CHECK (status IN ('DRAFT','REVIEWED','RELEASED','CONVERTED','CANCELLED'))
);
CREATE TABLE prod_purchase_suggestion_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, plan_order_id uuid NOT NULL REFERENCES prod_plan_order(id),
  external_suggestion_id text, purchase_order_id text, external_version integer, status text NOT NULL DEFAULT 'SUGGESTED',
  eta date, received_qty decimal(18,6) NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, plan_order_id)
);

-- APS, kitting and inventory requests.
CREATE TABLE prod_schedule_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL, task_id uuid,
  factory_resource_id text NOT NULL, horizon_start timestamptz NOT NULL, horizon_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PENDING', objective_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  parameters_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, code),
  CHECK (horizon_end > horizon_start), CHECK (status IN ('PENDING','RUNNING','CANDIDATE_READY','PUBLISHED','FAILED','CANCELLED'))
);
CREATE TABLE prod_schedule_candidate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, schedule_run_id uuid NOT NULL REFERENCES prod_schedule_run(id),
  candidate_no integer NOT NULL, score decimal(18,6), is_selected boolean NOT NULL DEFAULT false,
  impact_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, published_at timestamptz, published_by text,
  UNIQUE (tenant_id, schedule_run_id, candidate_no)
);
CREATE TABLE prod_schedule_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, candidate_id uuid NOT NULL REFERENCES prod_schedule_candidate(id),
  work_order_id uuid, operation_id uuid, work_center_resource_id text NOT NULL, employee_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, frozen boolean NOT NULL DEFAULT false,
  constraint_evidence jsonb NOT NULL DEFAULT '{}'::jsonb, CHECK (ends_at > starts_at)
);
CREATE TABLE prod_kitting_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, work_order_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'CHECKING', checked_at timestamptz, expires_at timestamptz,
  shortage_summary jsonb NOT NULL DEFAULT '[]'::jsonb, created_by text NOT NULL, row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('CHECKING','READY','PARTIAL_READY','SHORTAGE','EXPIRED','FAILED'))
);
CREATE TABLE prod_kitting_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, kitting_check_id uuid NOT NULL REFERENCES prod_kitting_check(id),
  component_product_id text NOT NULL, required_qty decimal(18,6) NOT NULL, available_qty decimal(18,6) NOT NULL DEFAULT 0,
  reserved_qty decimal(18,6) NOT NULL DEFAULT 0, shortage_qty decimal(18,6) NOT NULL DEFAULT 0,
  is_critical boolean NOT NULL DEFAULT false, status text NOT NULL, UNIQUE (tenant_id, kitting_check_id, component_product_id)
);
CREATE TABLE prod_inventory_reservation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, work_order_id uuid NOT NULL,
  component_product_id text NOT NULL, inventory_warehouse_id text NOT NULL, inventory_reservation_id text,
  qty decimal(18,6) NOT NULL CHECK (qty > 0), status text NOT NULL DEFAULT 'POSTING', idempotency_key text NOT NULL,
  external_transaction_id text, failure_code text, failure_message text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key), UNIQUE (tenant_id, external_transaction_id),
  CHECK (status IN ('POSTING','POSTED','FAILED','RELEASING','RELEASED'))
);
CREATE TABLE prod_material_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, work_order_id uuid NOT NULL,
  transaction_type text NOT NULL, component_product_id text NOT NULL, qty decimal(18,6) NOT NULL CHECK (qty > 0), uom text NOT NULL,
  inventory_warehouse_id text NOT NULL, bin_id text, status text NOT NULL DEFAULT 'POSTING', idempotency_key text NOT NULL,
  external_transaction_id text, failure_code text, failure_message text, posted_at timestamptz,
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key), UNIQUE (tenant_id, external_transaction_id),
  CHECK (transaction_type IN ('ISSUE','RETURN','SUPPLEMENT')), CHECK (status IN ('POSTING','POSTED','FAILED','REVERSED'))
);

-- Work order execution.
CREATE TABLE prod_work_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL, product_id text NOT NULL,
  product_name text, factory_resource_id text NOT NULL, workshop_resource_id text, line_resource_id text,
  work_center_resource_id text NOT NULL, planned_qty decimal(18,6) NOT NULL CHECK (planned_qty > 0),
  input_qty decimal(18,6) NOT NULL DEFAULT 0, reported_good_qty decimal(18,6) NOT NULL DEFAULT 0,
  reported_defect_qty decimal(18,6) NOT NULL DEFAULT 0, reported_scrap_qty decimal(18,6) NOT NULL DEFAULT 0,
  posted_qty decimal(18,6) NOT NULL DEFAULT 0, uom text NOT NULL, due_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT', bom_snapshot_id uuid REFERENCES prod_bom_snapshot(id),
  routing_snapshot_id uuid REFERENCES prod_routing_snapshot(id), schedule_candidate_id uuid REFERENCES prod_schedule_candidate(id),
  kitting_check_id uuid REFERENCES prod_kitting_check(id), kitting_status text, assignee_employee_id text, correlation_id text NOT NULL,
  parameter_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, created_by text NOT NULL, row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (status IN ('DRAFT','PLANNED','SCHEDULED','KITTING','RELEASED','IN_PROGRESS','PAUSED','COMPLETED','CLOSING','CLOSED','CANCELLING','CANCELLED'))
);
ALTER TABLE prod_plan_order ADD CONSTRAINT fk_plan_order_work_order FOREIGN KEY (converted_work_order_id) REFERENCES prod_work_order(id);
ALTER TABLE prod_schedule_operation ADD CONSTRAINT fk_schedule_operation_work_order FOREIGN KEY (work_order_id) REFERENCES prod_work_order(id);
ALTER TABLE prod_kitting_check ADD CONSTRAINT fk_kitting_work_order FOREIGN KEY (work_order_id) REFERENCES prod_work_order(id);
ALTER TABLE prod_inventory_reservation ADD CONSTRAINT fk_reservation_work_order FOREIGN KEY (work_order_id) REFERENCES prod_work_order(id);
ALTER TABLE prod_material_transaction ADD CONSTRAINT fk_material_work_order FOREIGN KEY (work_order_id) REFERENCES prod_work_order(id);
CREATE TABLE prod_work_order_demand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, work_order_id uuid NOT NULL REFERENCES prod_work_order(id),
  demand_id uuid NOT NULL REFERENCES prod_demand(id), allocated_qty decimal(18,6) NOT NULL CHECK (allocated_qty > 0),
  priority_rank integer NOT NULL, customer_locked boolean NOT NULL DEFAULT false, promised_date date,
  UNIQUE (tenant_id, work_order_id, demand_id)
);
CREATE TABLE prod_work_order_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, work_order_id uuid NOT NULL REFERENCES prod_work_order(id),
  sequence_no integer NOT NULL, operation_code text NOT NULL, operation_name text NOT NULL, work_center_resource_id text NOT NULL,
  assignee_employee_ids jsonb NOT NULL DEFAULT '[]'::jsonb, planned_start timestamptz, planned_end timestamptz,
  actual_start timestamptz, actual_end timestamptz, input_qty decimal(18,6) NOT NULL DEFAULT 0,
  good_qty decimal(18,6) NOT NULL DEFAULT 0, defect_qty decimal(18,6) NOT NULL DEFAULT 0, scrap_qty decimal(18,6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING', row_version bigint NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, work_order_id, sequence_no), CHECK (status IN ('PENDING','READY','IN_PROGRESS','PAUSED','COMPLETED','SKIPPED'))
);
CREATE TABLE prod_work_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, work_order_id uuid NOT NULL REFERENCES prod_work_order(id),
  operation_id uuid REFERENCES prod_work_order_operation(id), good_qty decimal(18,6) NOT NULL DEFAULT 0,
  defect_qty decimal(18,6) NOT NULL DEFAULT 0, scrap_qty decimal(18,6) NOT NULL DEFAULT 0,
  input_qty decimal(18,6) NOT NULL DEFAULT 0, uom text NOT NULL, status text NOT NULL DEFAULT 'DRAFT',
  reported_by text NOT NULL, reported_at timestamptz NOT NULL DEFAULT now(), source text NOT NULL DEFAULT 'WEB',
  remark text, row_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (good_qty >= 0 AND defect_qty >= 0 AND scrap_qty >= 0 AND input_qty >= 0),
  CHECK (good_qty + defect_qty + scrap_qty > 0), CHECK (status IN ('DRAFT','SUBMITTED','PROCESSING','POSTED','CORRECTING','CORRECTED','FAILED'))
);
CREATE TABLE prod_work_report_correction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, original_report_id uuid NOT NULL REFERENCES prod_work_report(id),
  replacement_report_id uuid REFERENCES prod_work_report(id), reason_code text NOT NULL, reason text NOT NULL,
  original_snapshot jsonb NOT NULL, corrected_snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'POSTED',
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, original_report_id, id)
);

-- Quality, finished-goods receipt and close.
CREATE TABLE prod_inspection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL,
  work_order_id uuid NOT NULL REFERENCES prod_work_order(id), inspection_type text NOT NULL DEFAULT 'FQC',
  parent_inspection_id uuid REFERENCES prod_inspection(id), sample_qty decimal(18,6) NOT NULL CHECK (sample_qty > 0),
  passed_qty decimal(18,6) NOT NULL DEFAULT 0, failed_qty decimal(18,6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'CREATED', disposition_status text, inspector_id text,
  inspected_at timestamptz, result_reason text, row_version bigint NOT NULL DEFAULT 1,
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code), CHECK (inspection_type IN ('IQC','IPQC','FQC')),
  CHECK (status IN ('CREATED','SAMPLING','INSPECTING','PASSED','FAILED','DISPOSITION_PENDING','REWORK','REINSPECTION','SCRAP_PENDING','SCRAPPED'))
);
CREATE TABLE prod_inspection_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, inspection_id uuid NOT NULL REFERENCES prod_inspection(id),
  item_code text NOT NULL, item_name text NOT NULL, specification text, measured_value text, result text NOT NULL,
  defect_code text, remark text, UNIQUE (tenant_id, inspection_id, item_code)
);
CREATE TABLE prod_nonconformity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL,
  inspection_id uuid NOT NULL REFERENCES prod_inspection(id), qty decimal(18,6) NOT NULL CHECK (qty > 0),
  reason_code text NOT NULL, disposition text, status text NOT NULL DEFAULT 'OPEN', owner_employee_id text,
  closed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, code),
  CHECK (status IN ('OPEN','DISPOSITION_PENDING','REWORKING','SCRAP_PENDING','CLOSED'))
);
CREATE TABLE prod_rework_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL,
  source_inspection_id uuid NOT NULL REFERENCES prod_inspection(id), work_order_id uuid NOT NULL REFERENCES prod_work_order(id),
  qty decimal(18,6) NOT NULL CHECK (qty > 0), status text NOT NULL DEFAULT 'CREATED', routing_snapshot jsonb,
  created_by text NOT NULL, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code), CHECK (status IN ('CREATED','RELEASED','IN_PROGRESS','COMPLETED','CANCELLED'))
);
CREATE TABLE prod_completion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, code text NOT NULL,
  work_order_id uuid NOT NULL REFERENCES prod_work_order(id), inspection_id uuid NOT NULL REFERENCES prod_inspection(id),
  qty decimal(18,6) NOT NULL CHECK (qty > 0), uom text NOT NULL, warehouse_resource_id text NOT NULL,
  inventory_warehouse_id text NOT NULL, bin_id text, trace_mode text NOT NULL DEFAULT 'NONE', batch_no text,
  serial_numbers jsonb NOT NULL DEFAULT '[]'::jsonb, production_date date NOT NULL, allocation_revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT', inventory_idempotency_key text NOT NULL, external_transaction_id text,
  task_id uuid, failure_code text, failure_message text, remark text, created_by text NOT NULL, posted_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code), UNIQUE (tenant_id, inventory_idempotency_key), UNIQUE (tenant_id, external_transaction_id),
  CHECK (trace_mode IN ('NONE','BATCH','SERIAL')), CHECK (status IN ('DRAFT','SUBMITTED','POSTING','POSTED','FAILED','REVERSING','REVERSED')),
  CHECK ((trace_mode <> 'BATCH') OR (batch_no IS NOT NULL AND length(trim(batch_no)) > 0))
);
CREATE TABLE prod_completion_serial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, completion_id uuid NOT NULL REFERENCES prod_completion(id),
  serial_number text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, serial_number),
  UNIQUE (tenant_id, completion_id, serial_number)
);
CREATE TABLE prod_completion_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, completion_id uuid NOT NULL REFERENCES prod_completion(id),
  demand_id uuid NOT NULL REFERENCES prod_demand(id), qty decimal(18,6) NOT NULL CHECK (qty > 0),
  rank integer NOT NULL, rule_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, completion_id, demand_id)
);
CREATE TABLE prod_work_order_close (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, work_order_id uuid NOT NULL REFERENCES prod_work_order(id),
  status text NOT NULL DEFAULT 'SUBMITTED', check_snapshot jsonb NOT NULL, variance_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text, submitted_by text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(), approved_by text,
  approved_at timestamptz, row_version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('SUBMITTED','REVIEW_PENDING','APPROVED','REJECTED','CANCELLED'))
);

-- Governance, reliability, audit and configuration.
CREATE TABLE prod_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL, from_status text, to_status text NOT NULL, reason_code text, reason text,
  actor_id text NOT NULL, trace_id text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE prod_operation_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, task_type text NOT NULL,
  aggregate_type text, aggregate_id uuid, status text NOT NULL DEFAULT 'PENDING', progress integer NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 0, max_retry_count integer NOT NULL DEFAULT 4, next_retry_at timestamptz,
  input jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb, error_code text, error_message text, trace_id text NOT NULL,
  created_by text NOT NULL, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (progress BETWEEN 0 AND 100), CHECK (status IN ('PENDING','RUNNING','RETRY_WAIT','SUCCEEDED','DEAD_LETTER','MANUAL_INTERVENTION','CANCELLED'))
);
ALTER TABLE prod_mrp_run ADD CONSTRAINT fk_mrp_task FOREIGN KEY (task_id) REFERENCES prod_operation_task(id);
ALTER TABLE prod_schedule_run ADD CONSTRAINT fk_schedule_task FOREIGN KEY (task_id) REFERENCES prod_operation_task(id);
ALTER TABLE prod_completion ADD CONSTRAINT fk_completion_task FOREIGN KEY (task_id) REFERENCES prod_operation_task(id);
CREATE TABLE prod_event_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, consumer_name text NOT NULL,
  event_id text NOT NULL, event_type text NOT NULL, event_version integer NOT NULL DEFAULT 1,
  aggregate_id text, aggregate_version bigint, status text NOT NULL DEFAULT 'RECEIVED', payload jsonb NOT NULL,
  retry_count integer NOT NULL DEFAULT 0, error_message text, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
  UNIQUE (tenant_id, consumer_name, event_id), CHECK (status IN ('RECEIVED','PROCESSING','PROCESSED','RETRY_WAIT','DEAD_LETTER','DUPLICATE'))
);
CREATE TABLE prod_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, event_id text NOT NULL,
  event_type text NOT NULL, event_version integer NOT NULL DEFAULT 1, aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL, aggregate_version bigint NOT NULL, correlation_id text, trace_id text NOT NULL,
  payload jsonb NOT NULL, status text NOT NULL DEFAULT 'PENDING', retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
  UNIQUE (tenant_id, event_id), CHECK (status IN ('PENDING','PUBLISHING','PUBLISHED','RETRY_WAIT','DEAD_LETTER'))
);
CREATE TABLE prod_idempotency_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, idempotency_key text NOT NULL,
  command_type text NOT NULL, request_hash text NOT NULL, response_status integer, response_body jsonb,
  aggregate_type text, aggregate_id uuid, status text NOT NULL DEFAULT 'COMPLETED', trace_id text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, command_type, idempotency_key), CHECK (status IN ('PROCESSING','COMPLETED','FAILED'))
);
CREATE TABLE prod_audit_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, action text NOT NULL,
  aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, actor_account_id text NOT NULL, actor_employee_id text,
  permission_version text, before_snapshot jsonb, after_snapshot jsonb, reason text, trace_id text NOT NULL,
  ip_address inet, user_agent text, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE prod_parameter_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, parameter_code text NOT NULL,
  scope_type text NOT NULL, scope_id text NOT NULL DEFAULT '*', version integer NOT NULL, value jsonb NOT NULL,
  effective_from timestamptz NOT NULL, effective_to timestamptz, status text NOT NULL DEFAULT 'SCHEDULED',
  created_by text NOT NULL, approved_by text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, parameter_code, scope_type, scope_id, version), CHECK (status IN ('DRAFT','SCHEDULED','EFFECTIVE','EXPIRED','CANCELLED'))
);

-- Query and worker indexes.
CREATE INDEX idx_prod_demand_tenant_status_due ON prod_demand (tenant_id, status, due_date);
CREATE INDEX idx_prod_work_order_tenant_status_due ON prod_work_order (tenant_id, status, due_date);
CREATE INDEX idx_prod_report_tenant_work_order ON prod_work_report (tenant_id, work_order_id, reported_at);
CREATE INDEX idx_prod_inspection_tenant_work_order ON prod_inspection (tenant_id, work_order_id, created_at);
CREATE INDEX idx_prod_completion_tenant_work_order ON prod_completion (tenant_id, work_order_id, created_at);
CREATE INDEX idx_prod_status_history_aggregate ON prod_status_history (tenant_id, aggregate_type, aggregate_id, occurred_at);
CREATE INDEX idx_prod_task_worker ON prod_operation_task (status, next_retry_at, created_at);
CREATE INDEX idx_prod_outbox_worker ON prod_event_outbox (status, next_retry_at, created_at);
CREATE INDEX idx_prod_inbox_ordering ON prod_event_inbox (tenant_id, aggregate_id, aggregate_version);
CREATE INDEX idx_prod_audit_lookup ON prod_audit_snapshot (tenant_id, aggregate_type, aggregate_id, occurred_at);

-- Keep updated_at and row_version consistent for mutable aggregates.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prod_bom','prod_routing','prod_calendar','prod_resource_profile','prod_demand','prod_mps',
    'prod_plan_order','prod_schedule_run','prod_kitting_check','prod_inventory_reservation','prod_material_transaction',
    'prod_work_order','prod_work_report','prod_inspection','prod_rework_order','prod_completion','prod_work_order_close','prod_operation_task']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION prod_touch_updated_at()', t, t);
  END LOOP;
END $$;

-- Defense in depth. The application also includes tenant_id in every query.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename LIKE 'prod_%'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', t);
  END LOOP;
END $$;

COMMIT;

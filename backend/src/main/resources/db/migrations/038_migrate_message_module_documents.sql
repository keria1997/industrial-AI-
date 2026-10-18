-- Move message facts from document compatibility tables into physical msg_* tables.
-- Existing API IDs are retained in api_id; UUID remains only the physical primary key.
BEGIN;

ALTER TABLE msg_template ADD COLUMN IF NOT EXISTS api_id text;
ALTER TABLE msg_record ADD COLUMN IF NOT EXISTS api_id text;
ALTER TABLE msg_user_preference ADD COLUMN IF NOT EXISTS api_id text;
ALTER TABLE msg_subscription ADD COLUMN IF NOT EXISTS api_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_msg_template_tenant_source
  ON msg_template(tenant_id, api_id) WHERE api_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_msg_record_tenant_source
  ON msg_record(tenant_id, api_id) WHERE api_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_msg_preference_tenant_source
  ON msg_user_preference(tenant_id, api_id) WHERE api_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_msg_subscription_tenant_source
  ON msg_subscription(tenant_id, api_id) WHERE api_id IS NOT NULL;

INSERT INTO msg_template (
  id, api_id, tenant_id, code, name, category, channel, title_template, body_template,
  variables, priority, is_active, remark, row_version, created_at, updated_at, created_by
)
SELECT
  CASE
    WHEN doc_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN doc_id::uuid
    ELSE (
      substr(md5('message:template:' || doc_id), 1, 8) || '-' ||
      substr(md5('message:template:' || doc_id), 9, 4) || '-' ||
      substr(md5('message:template:' || doc_id), 13, 4) || '-' ||
      substr(md5('message:template:' || doc_id), 17, 4) || '-' ||
      substr(md5('message:template:' || doc_id), 21, 12)
    )::uuid
  END,
  COALESCE(data->>'id', doc_id),
  source.tenant_id,
  data->>'code',
  data->>'name',
  CASE COALESCE(data->>'category', 'system') WHEN 'sales' THEN 'order' ELSE COALESCE(data->>'category', 'system') END,
  COALESCE(data->>'channel', 'in_app'),
  data->>'titleTemplate',
  data->>'bodyTemplate',
  COALESCE(data->'variables', '[]'::jsonb),
  COALESCE(data->>'priority', 'normal'),
  COALESCE((data->>'isActive')::boolean, true),
  COALESCE(data->>'remark', ''),
  COALESCE((data->>'version')::bigint, 1),
  COALESCE((data->>'createdAt')::timestamptz, now()),
  COALESCE((data->>'updatedAt')::timestamptz, now()),
  COALESCE(data->>'createdBy', '')
FROM module_document source
WHERE module = 'message'
  AND kind = 'template'
  AND source.tenant_id IS NOT NULL
  AND data->>'code' IS NOT NULL
ON CONFLICT (tenant_id, code) DO UPDATE SET
  api_id = COALESCE(msg_template.api_id, EXCLUDED.api_id),
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  channel = EXCLUDED.channel,
  title_template = EXCLUDED.title_template,
  body_template = EXCLUDED.body_template,
  variables = EXCLUDED.variables,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  remark = EXCLUDED.remark;

INSERT INTO msg_record (
  id, api_id, tenant_id, msg_no, template_code, category, channel, priority, title, body,
  recipient_id, recipient_name, sender_id, sender_name, source_type, source_id,
  source_doc_no, is_read, read_at, is_archived, archived_at, is_starred, metadata,
  status, error_message, sent_at, row_version, created_at, updated_at
)
SELECT
  CASE
    WHEN doc_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN doc_id::uuid
    ELSE (
      substr(md5('message:record:' || doc_id), 1, 8) || '-' ||
      substr(md5('message:record:' || doc_id), 9, 4) || '-' ||
      substr(md5('message:record:' || doc_id), 13, 4) || '-' ||
      substr(md5('message:record:' || doc_id), 17, 4) || '-' ||
      substr(md5('message:record:' || doc_id), 21, 12)
    )::uuid
  END,
  COALESCE(data->>'id', doc_id),
  source.tenant_id,
  data->>'msgNo',
  data->>'templateCode',
  CASE COALESCE(data->>'category', 'system') WHEN 'sales' THEN 'order' ELSE COALESCE(data->>'category', 'system') END,
  COALESCE(data->>'channel', 'in_app'),
  COALESCE(data->>'priority', 'normal'),
  data->>'title',
  data->>'body',
  data->>'recipientId',
  COALESCE(data->>'recipientName', ''),
  COALESCE(data->>'senderId', 'system'),
  COALESCE(data->>'senderName', '系统'),
  COALESCE(data->>'sourceType', ''),
  COALESCE(data->>'sourceId', ''),
  COALESCE(data->>'sourceDocNo', ''),
  COALESCE((data->>'isRead')::boolean, false),
  (NULLIF(data->>'readAt', ''))::timestamptz,
  COALESCE((data->>'isArchived')::boolean, false),
  (NULLIF(data->>'archivedAt', ''))::timestamptz,
  COALESCE((data->>'isStarred')::boolean, false),
  COALESCE(data->'metadata', '{}'::jsonb),
  COALESCE(data->>'status', 'sent'),
  COALESCE(data->>'errorMessage', ''),
  (NULLIF(data->>'sentAt', ''))::timestamptz,
  COALESCE((data->>'version')::bigint, 1),
  COALESCE((data->>'createdAt')::timestamptz, now()),
  COALESCE((data->>'updatedAt')::timestamptz, now())
FROM module_document source
WHERE module = 'message'
  AND kind = 'record'
  AND source.tenant_id IS NOT NULL
  AND data->>'msgNo' IS NOT NULL
  AND data->>'title' IS NOT NULL
  AND data->>'body' IS NOT NULL
  AND data->>'recipientId' IS NOT NULL
ON CONFLICT (tenant_id, msg_no) DO UPDATE SET
  api_id = COALESCE(msg_record.api_id, EXCLUDED.api_id),
  template_code = EXCLUDED.template_code,
  category = EXCLUDED.category,
  channel = EXCLUDED.channel,
  priority = EXCLUDED.priority,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  recipient_id = EXCLUDED.recipient_id,
  recipient_name = EXCLUDED.recipient_name,
  sender_id = EXCLUDED.sender_id,
  sender_name = EXCLUDED.sender_name,
  source_type = EXCLUDED.source_type,
  source_id = EXCLUDED.source_id,
  source_doc_no = EXCLUDED.source_doc_no,
  is_read = EXCLUDED.is_read,
  read_at = EXCLUDED.read_at,
  is_archived = EXCLUDED.is_archived,
  archived_at = EXCLUDED.archived_at,
  is_starred = EXCLUDED.is_starred,
  metadata = EXCLUDED.metadata,
  status = EXCLUDED.status,
  error_message = EXCLUDED.error_message,
  sent_at = EXCLUDED.sent_at;

INSERT INTO msg_user_preference (
  id, api_id, tenant_id, user_id, category, channel, enabled, min_priority,
  quiet_hours_start, quiet_hours_end, row_version, created_at, updated_at
)
SELECT
  CASE
    WHEN doc_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN doc_id::uuid
    ELSE (
      substr(md5('message:preference:' || doc_id), 1, 8) || '-' ||
      substr(md5('message:preference:' || doc_id), 9, 4) || '-' ||
      substr(md5('message:preference:' || doc_id), 13, 4) || '-' ||
      substr(md5('message:preference:' || doc_id), 17, 4) || '-' ||
      substr(md5('message:preference:' || doc_id), 21, 12)
    )::uuid
  END,
  COALESCE(data->>'id', doc_id),
  source.tenant_id,
  data->>'userId',
  data->>'category',
  COALESCE(data->>'channel', 'in_app'),
  COALESCE((data->>'enabled')::boolean, true),
  COALESCE(data->>'minPriority', 'low'),
  COALESCE(data->>'quietHoursStart', ''),
  COALESCE(data->>'quietHoursEnd', ''),
  COALESCE((data->>'version')::bigint, 1),
  COALESCE((data->>'createdAt')::timestamptz, now()),
  COALESCE((data->>'updatedAt')::timestamptz, now())
FROM module_document source
WHERE module = 'message'
  AND kind = 'preference'
  AND source.tenant_id IS NOT NULL
  AND data->>'userId' IS NOT NULL
  AND data->>'category' IS NOT NULL
ON CONFLICT (tenant_id, user_id, category, channel) DO UPDATE SET
  api_id = COALESCE(msg_user_preference.api_id, EXCLUDED.api_id),
  channel = EXCLUDED.channel,
  enabled = EXCLUDED.enabled,
  min_priority = EXCLUDED.min_priority,
  quiet_hours_start = EXCLUDED.quiet_hours_start,
  quiet_hours_end = EXCLUDED.quiet_hours_end;

INSERT INTO msg_subscription (
  id, api_id, tenant_id, user_id, event_type, category, enabled,
  row_version, created_at, updated_at
)
SELECT
  CASE
    WHEN doc_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN doc_id::uuid
    ELSE (
      substr(md5('message:subscription:' || doc_id), 1, 8) || '-' ||
      substr(md5('message:subscription:' || doc_id), 9, 4) || '-' ||
      substr(md5('message:subscription:' || doc_id), 13, 4) || '-' ||
      substr(md5('message:subscription:' || doc_id), 17, 4) || '-' ||
      substr(md5('message:subscription:' || doc_id), 21, 12)
    )::uuid
  END,
  COALESCE(data->>'id', doc_id),
  source.tenant_id,
  data->>'userId',
  data->>'eventType',
  COALESCE(data->>'category', 'system'),
  COALESCE((data->>'enabled')::boolean, true),
  COALESCE((data->>'version')::bigint, 1),
  COALESCE((data->>'createdAt')::timestamptz, now()),
  COALESCE((data->>'updatedAt')::timestamptz, now())
FROM module_document source
WHERE module = 'message'
  AND kind = 'subscription'
  AND source.tenant_id IS NOT NULL
  AND data->>'userId' IS NOT NULL
  AND data->>'eventType' IS NOT NULL
ON CONFLICT (tenant_id, user_id, event_type) DO UPDATE SET
  api_id = COALESCE(msg_subscription.api_id, EXCLUDED.api_id),
  category = EXCLUDED.category,
  enabled = EXCLUDED.enabled;

INSERT INTO msg_outbox (
  tenant_id, event_id, event_type, aggregate_type, aggregate_id, aggregate_version,
  correlation_id, trace_id, payload, status, attempts, last_error, created_at
)
SELECT
  source.tenant_id,
  source.event_id,
  data->>'eventType',
  data->>'aggregateType',
  data->>'aggregateId',
  COALESCE((data->>'aggregateVersion')::bigint, 1),
  COALESCE(data->>'correlationId', ''),
  COALESCE(data->>'traceId', ''),
  COALESCE(data->'payload', '{}'::jsonb),
  COALESCE(source.status, 'PENDING'),
  COALESCE(source.attempts, 0),
  COALESCE(data->>'lastError', ''),
  COALESCE(source.created_at, now())
FROM module_outbox_event source
WHERE module = 'message'
  AND source.tenant_id IS NOT NULL
  AND source.event_id IS NOT NULL
ON CONFLICT (tenant_id, event_id) DO UPDATE SET
  event_type = EXCLUDED.event_type,
  aggregate_type = EXCLUDED.aggregate_type,
  aggregate_id = EXCLUDED.aggregate_id,
  aggregate_version = EXCLUDED.aggregate_version,
  correlation_id = EXCLUDED.correlation_id,
  trace_id = EXCLUDED.trace_id,
  payload = EXCLUDED.payload,
  status = EXCLUDED.status,
  attempts = EXCLUDED.attempts,
  last_error = EXCLUDED.last_error;

INSERT INTO msg_audit_log (
  id, tenant_id, aggregate_type, aggregate_id, aggregate_version, action,
  before, after, correlation_id, trace_id, operator_id, occurred_at
)
SELECT
  (data->>'id')::uuid,
  source.tenant_id,
  data->>'aggregateType',
  data->>'aggregateId',
  COALESCE((data->>'aggregateVersion')::bigint, 1),
  data->>'action',
  data->'before',
  data->'after',
  COALESCE(data->>'correlationId', ''),
  COALESCE(data->>'traceId', ''),
  COALESCE(data->>'actorId', ''),
  COALESCE((data->>'occurredAt')::timestamptz, source.occurred_at, now())
FROM module_audit_log source
WHERE module = 'message'
  AND source.tenant_id IS NOT NULL
  AND data->>'id' IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  aggregate_version = EXCLUDED.aggregate_version,
  before = EXCLUDED.before,
  after = EXCLUDED.after;

INSERT INTO msg_idempotency_record (
  tenant_id, command_type, idempotency_key, request_hash,
  response_status, response_body, trace_id, created_at
)
SELECT
  source.tenant_id,
  source.command_type,
  source.idempotency_key,
  COALESCE(data->>'requestHash', ''),
  (data->>'statusCode')::integer,
  data->'body',
  COALESCE(data->>'traceId', ''),
  COALESCE(source.created_at, now())
FROM module_idempotency_record source
WHERE module = 'message'
  AND source.tenant_id IS NOT NULL
  AND data->>'statusCode' IS NOT NULL
ON CONFLICT (tenant_id, command_type, idempotency_key) DO UPDATE SET
  request_hash = EXCLUDED.request_hash,
  response_status = EXCLUDED.response_status,
  response_body = EXCLUDED.response_body;

-- Worker discovery reads tenant IDs only; bootstrap never exposes business payload columns.
DROP POLICY IF EXISTS msg_tenant_isolation_outbox ON msg_outbox;
CREATE POLICY msg_tenant_isolation_outbox ON msg_outbox
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)
    OR current_setting('app.bootstrap_mode', true) = 'true'
  );

COMMIT;

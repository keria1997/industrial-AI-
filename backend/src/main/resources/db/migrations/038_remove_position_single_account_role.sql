BEGIN;

-- Stop exposing position-backed authorization through the JSON document store.
DELETE FROM module_document
WHERE module = 'platform' AND kind = 'position';

UPDATE module_document
SET data = data - 'position'
WHERE module = 'personnel' AND kind = 'employee'
  AND data ? 'position';

UPDATE module_document
SET data = data - 'primaryPositionId'
WHERE module = 'platform' AND kind = 'employee'
  AND data ? 'primaryPositionId';

UPDATE module_document
SET data = data - 'position'
WHERE module = 'auth' AND kind = 'registeredUser'
  AND data ? 'position';

DO $$
DECLARE invalid_accounts text;
BEGIN
  SELECT string_agg(doc_id, ', ')
    INTO invalid_accounts
  FROM module_document
  WHERE module = 'platform' AND kind = 'account'
    AND jsonb_typeof(data->'directRoleIds') = 'array'
    AND jsonb_array_length(data->'directRoleIds') <> 1;
  IF invalid_accounts IS NOT NULL THEN
    RAISE EXCEPTION 'Accounts must have exactly one direct role before migration: %', invalid_accounts;
  END IF;
END $$;

UPDATE module_document
SET data = jsonb_set(
  data - 'directRoleIds',
  '{roleId}',
  to_jsonb(data->'directRoleIds'->>0),
  true
)
WHERE module = 'platform' AND kind = 'account'
  AND jsonb_typeof(data->'directRoleIds') = 'array';

DELETE FROM module_document
WHERE module = 'platform' AND kind = 'permission'
  AND data->>'code' = 'platform.position.manage';

UPDATE module_document
SET data = jsonb_set(
  data,
  '{grants}',
  COALESCE((
    SELECT jsonb_agg(grant_value ORDER BY ord)
    FROM jsonb_array_elements(data->'grants') WITH ORDINALITY
      AS grants(grant_value, ord)
    WHERE grant_value->>'permissionId' <> 'PERM-POSITION-MANAGE'
  ), '[]'::jsonb),
  false
)
WHERE module = 'platform' AND kind = 'roleGrant'
  AND data->'grants' @> '[{"permissionId":"PERM-POSITION-MANAGE"}]';

DELETE FROM module_document
WHERE module = 'platform' AND kind = 'approvalRule'
  AND data->>'resolver' = 'by_position';

ALTER TABLE iam_employee
  DROP CONSTRAINT IF EXISTS iam_employee_primary_position_id_fkey;
ALTER TABLE iam_employee DROP COLUMN IF EXISTS primary_position_id;
ALTER TABLE iam_employee DROP COLUMN IF EXISTS position;
ALTER TABLE registered_users DROP COLUMN IF EXISTS position;

ALTER TABLE iam_account ADD COLUMN IF NOT EXISTS role_id text;
UPDATE iam_account
SET role_id = direct_role_ids[1]
WHERE role_id IS NULL AND array_length(direct_role_ids, 1) = 1;
ALTER TABLE iam_account ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE iam_account DROP COLUMN IF EXISTS direct_role_ids;
CREATE UNIQUE INDEX IF NOT EXISTS iam_account_employee_id_uq
  ON iam_account (tenant_id, employee_id);

ALTER TABLE iam_approval_rule
  DROP CONSTRAINT IF EXISTS iam_approval_rule_resolver_check;
ALTER TABLE iam_approval_rule ADD CONSTRAINT iam_approval_rule_resolver_check
  CHECK (resolver IN ('by_role','by_org_manager'));

DROP TABLE IF EXISTS iam_position;

COMMIT;

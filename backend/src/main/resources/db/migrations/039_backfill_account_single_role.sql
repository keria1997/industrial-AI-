BEGIN;

UPDATE module_document
SET data = jsonb_set(
  data,
  '{roleId}',
  CASE data->>'role'
    WHEN '老板' THEN to_jsonb('ROLE-ADMIN'::text)
    WHEN '超级管理员' THEN to_jsonb('ROLE-ADMIN'::text)
    WHEN '系统管理员' THEN to_jsonb('ROLE-ADMIN'::text)
    WHEN '管理员' THEN to_jsonb('ROLE-ADMIN'::text)
    ELSE 'null'::jsonb
  END,
  true
)
WHERE module = 'platform' AND kind = 'account'
  AND (data->>'roleId' IS NULL OR data->>'roleId' = '')
  AND data ? 'role';

COMMIT;

-- Ver y reintentar los procesos automáticos que fallaron: los reciben los
-- roles de sistema; los roles propios de cada empresa los asigna un owner.
INSERT INTO "permissions" ("id", "key") VALUES
  ('processes-read-v1', 'processes:read'),
  ('processes-retry-v1', 'processes:retry')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("tenant_id", "role_id", "permission_id")
SELECT r.tenant_id, r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system = true
  AND p.key IN ('processes:read', 'processes:retry')
ON CONFLICT DO NOTHING;

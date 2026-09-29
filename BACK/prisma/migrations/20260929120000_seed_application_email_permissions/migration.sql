-- Application email and tenant integration permissions follow least privilege:
-- system roles receive them during upgrade, while custom roles require an
-- explicit assignment by an owner.
INSERT INTO "permissions" ("id", "key") VALUES
  ('integrations-read-v1', 'integrations:read'),
  ('integrations-manage-v1', 'integrations:manage'),
  ('applications-email-read-v1', 'applications:email:read'),
  ('applications-email-send-v1', 'applications:email:send')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system = true
  AND p.key IN (
    'integrations:read',
    'integrations:manage',
    'applications:email:read',
    'applications:email:send'
  )
ON CONFLICT DO NOTHING;

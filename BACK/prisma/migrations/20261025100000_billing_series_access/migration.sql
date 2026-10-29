-- Administrar series lo reciben los roles de sistema que ya podían cancelar
-- facturas; los roles propios del tenant lo asigna un owner.
INSERT INTO "permissions" ("id", "key") VALUES
  ('billing-series-manage-v1', 'billing:series:manage')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "role_permissions" rp ON rp.role_id = r.id
JOIN "permissions" cancel ON cancel.id = rp.permission_id AND cancel.key = 'billing:cancel'
CROSS JOIN "permissions" p
WHERE r.is_system = true
  AND p.key = 'billing:series:manage'
ON CONFLICT DO NOTHING;

-- Facturación electrónica dejó de ser núcleo: quien ya la había configurado
-- la conserva activa.
INSERT INTO "tenant_modules" ("id", "tenant_id", "module_name", "active", "activated_at")
SELECT gen_random_uuid()::text, sc.tenant_id, 'sifen', true, CURRENT_TIMESTAMP
FROM "sifen_configs" sc
ON CONFLICT ("tenant_id", "module_name") DO NOTHING;

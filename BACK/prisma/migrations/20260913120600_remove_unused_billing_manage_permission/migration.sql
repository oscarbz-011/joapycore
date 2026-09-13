-- billing:manage estaba en el catálogo pero ninguna ruta lo exigía: asignarlo
-- a un rol no daba acceso a nada. Facturación usa billing:read, billing:issue
-- y billing:cancel.
DELETE FROM "role_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" = 'billing:manage');
DELETE FROM "user_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" = 'billing:manage');
DELETE FROM "permissions" WHERE "key" = 'billing:manage';

# Plan de construcción — Seguridad de acceso a datos

**Objetivo:** que el acceso a los datos esté protegido en capas: qué módulos y acciones puede usar cada usuario, qué filas ve (de su empresa y, dentro de ella, según su alcance) y qué columnas recibe. Un olvido en una consulta o en un endpoint no debe alcanzar para exponer datos.

**Estado de partida (2026-11-13):**

| Capa | Hoy |
|---|---|
| Acceso por módulo y acción | 106 permisos en 345 endpoints, más el guard de módulos activos. El guard de permisos deja pasar un endpoint que no declara nada: hay 37 así, casi todos a propósito (datos propios del usuario, o un permiso que depende del caso y se revisa en el servicio). |
| Filas de otra empresa | Cada consulta filtra por `tenantId` a mano: unas 860 llamadas a Prisma y 14 consultas SQL. La base no frena un olvido. 20 de los 109 modelos no tienen `tenantId` (sobre todo renglones). |
| Filas dentro de la empresa | No existe. `sellerId`, `createdById` y `branchId` ya están en el modelo. |
| Columnas sensibles | No existe. Quien lee productos recibe el costo; quien lee nómina, los salarios. |
| Usuario de la base | La app se conecta como superusuario (`rolsuper`, `rolbypassrls`): puede crear o borrar tablas y se saltea cualquier política de filas. |

**Enfoque:**
- Postgres protege lo que nunca debe fallar: el aislamiento entre empresas.
- La aplicación resuelve lo que depende del usuario y de la configuración de cada empresa: alcance de filas dentro de la empresa y columnas visibles. La app usa una sola conexión para todos sus usuarios, así que esas reglas no pueden vivir en Postgres.
- Cada regla tiene un test que falla si alguien la saltea.

## Orden respecto de la modularidad

| Orden | Trabajo | Por qué en ese lugar |
|---|---|---|
| 1 | **Fase 0** (Trello #80) | Chica, no choca con nada y baja un riesgo real ya |
| 2 | C1: schema por módulo | Mecánica; conviene mientras ninguna rama toca el schema |
| 3 | **Fase 1** (Trello #81) | Toca muchas tablas: sobre el schema ya dividido, y cada manifiesto ya dice qué tablas son suyas |
| 4 | C4, C5 | No chocan con la fase 1, que cambia cómo se conecta Prisma y no las consultas |
| 5 | Reestructuración de Finanzas, C3 | Ya acordado |
| 6 | **Fases 2 y 3** (Trello #82, #83) | Son funcionalidad de producto: necesitan decisiones del usuario y que cada módulo pueda declararlas en su manifiesto (C5) |

**Excepción:** si hay empresas reales en producción antes de C1, la fase 1 va inmediatamente después de la fase 0.

**Regla:** nunca dos ramas largas que toquen el schema al mismo tiempo.

---

## Fase 0 — Mínimo privilegio (Trello #80)

Rama `feature/back/80-least-privilege-access`, worktree `.worktrees/security`.

### 0.1 Usuario de la base sin privilegios

- Script idempotente `pnpm db:app-role`: corre con el usuario dueño de las tablas y crea o actualiza el usuario de la app.
  - Sin superusuario, sin `BYPASSRLS`, sin crear bases ni roles.
  - Lee y escribe datos de todas las tablas de `public`, salvo `_prisma_migrations`.
  - Privilegios por defecto para que las tablas que creen las migraciones futuras ya tengan permisos.
- `prisma.config.ts` usa `MIGRATE_DATABASE_URL` si existe y, si no, `DATABASE_URL`. Sin la variable nueva todo sigue como hoy.
- Al arrancar, el backend avisa en el log si el usuario de la conexión es superusuario o se saltea RLS.
- CI: el schema y los datos de prueba se crean con el usuario dueño; los tests de integración y e2e corren con el usuario de la app. Un test de integración comprueba que ese usuario no es superusuario, no saltea RLS, no crea tablas y puede leer y escribir todas las tablas.
- Pasos para cambiar desarrollo y producción documentados en el README. No se cambia ningún entorno en esta rama.

### 0.2 Regla de acceso explícita en cada endpoint

- Decoradores nuevos:
  - `@AnyPermission(...)`: alcanza con uno de los permisos. Lo usan las rutas donde el permiso depende del caso (pedido o presupuesto, documento o plantilla, despacho o seguimiento del repartidor). El servicio sigue haciendo la revisión fina.
  - `@Authenticated()`: solo requiere sesión. Lo usan los datos propios del usuario (perfil, chat, notas, calendario), la marca de la empresa y cerrar sesión.
- El guard de permisos pasa a negar por defecto: un endpoint sin `@Permissions`, `@AnyPermission`, `@Authenticated` ni `@Public` responde 403.
- Test unitario que recorre todos los controllers por reflexión y falla si un endpoint no tiene regla o tiene más de una.

---

## Fase 1 — Aislamiento entre empresas en Postgres (Trello #81)

- `tenantId` en los 20 modelos que no lo tienen, con relleno desde el registro padre. Las tablas globales (`Tenant`, `Permission`) y las que se resuelven antes de conocer la empresa (por ejemplo, `RefreshToken` en el login) quedan fuera, en una lista declarada y revisada una por una.
- Política en cada tabla de empresa: `tenant_id = current_setting('app.tenant_id')`, con `FORCE ROW LEVEL SECURITY`.
- La empresa activa viaja a Postgres en cada consulta: contexto por request (AsyncLocalStorage) y una extensión de Prisma que abre la transacción con `set_config('app.tenant_id', …, true)`. Hay que resolver cómo convive con las ~170 transacciones existentes y medir el costo.
- Crons, outbox y workers declaran la empresa de cada trabajo. Lo que recorre todas las empresas usa un usuario de mantenimiento explícito.
- El aviso de la fase 0 pasa a ser error: con un usuario que saltea RLS, el backend no arranca en producción.
- Test de arquitectura: toda tabla con `tenantId` tiene política. Tests de integración: una consulta sin `tenantId` no devuelve filas de otra empresa, y una escritura con otra empresa falla.
- Se activa por módulo, con una migración para volver atrás.

## Fase 2 — Qué filas ve cada usuario dentro de la empresa (Trello #82)

- Alcance por permiso: lo mío, mi sucursal o todo (por ejemplo, `sales:read:own`, `sales:read:branch`, `sales:read`).
- Cada módulo declara en su manifiesto el dueño de sus registros (vendedor, creador, cobrador asignado) y su campo de sucursal. Un helper de repositorio arma el filtro y un test exige que las lecturas lo usen.
- Decisiones pendientes: qué módulos, qué dueño, y si se configura por empresa.

## Fase 3 — Campos sensibles (Trello #83)

- Cada módulo declara sus campos sensibles y el permiso que los muestra (por ejemplo, `products:cost:read`, `hr:salary:read`).
- Se quitan al armar la respuesta del backend; el front oculta la columna o muestra "—".
- Decisiones pendientes: la lista de campos, si quien no ve un campo puede filtrar u ordenar por él, y si se configura por empresa.

---

## Verificación de cada rama

- Backend: `tsc --noEmit`, ESLint, tests unitarios, tests de integración y e2e contra una base desechable (nunca la de desarrollo).
- Los tests de integración y e2e corren con el usuario de la app, no con el dueño.
- Revisión independiente antes del PR. El usuario mergea.

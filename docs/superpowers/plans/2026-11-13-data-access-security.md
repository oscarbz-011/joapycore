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

- Script idempotente `pnpm db:app-role`: corre con el usuario dueño de las tablas y crea o actualiza el usuario de la app. Se repite después de cada `prisma migrate deploy`, que crea la tabla de historial con los permisos por defecto.
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
- Pendiente: el guard global solo entiende HTTP. Si un gateway agrega handlers `@SubscribeMessage`, el guard los niega (y `switchToHttp()` no sirve ahí): esos handlers van a necesitar su propia regla.

---

## Fase 1 — Aislamiento entre empresas en Postgres (Trello #81)

**Hecha (2026-11, rama `feature/back/81-tenant-rls`).** Lo implementado y en qué cambió respecto del diseño inicial:

- `tenantId` en las 17 tablas que solo lo heredaban de su padre, con relleno desde el padre. Quedan sin él `Tenant`, `Permission` y `RefreshToken` (`tenant-exempt-tables.ts`). `PlatformEmailMessage` lo tiene opcional, por los correos propios de la plataforma.
- **La empresa viaja al tomar la conexión, no en una transacción por consulta.** `TenantPool` (subclase de `pg.Pool`) fija `app.tenant_id` cada vez que entrega una conexión, leyéndola de `TenantContext` (AsyncLocalStorage). El adaptador de Prisma pide conexión tanto para consultas sueltas como para transacciones, así que no hizo falta tocar las transacciones existentes. Costo medido: ~1,5 ms por consulta solo cuando la conexión cambia de empresa.
- **Modo plataforma en vez de un usuario de mantenimiento.** Crons, despacho del outbox, login, registro y refresh corren con `TenantContext.runAsPlatform`, que fija `app.all_tenants = on`. Contra lo que protege esta fase (una consulta que se olvida del `tenantId`) da lo mismo que un segundo usuario, sin otra credencial que desplegar. Los consumidores del outbox y los trabajos del worker de comunicaciones corren con la empresa del evento o del mensaje.
- **Sin `FORCE ROW LEVEL SECURITY`.** El dueño de las tablas no queda sujeto: si no, una migración de datos futura actualizaría cero filas sin avisar.
- **Las políticas no van en una migración.** `pnpm db:tenant-rls` activa RLS y recrea la política en toda tabla con columna `tenant_id`. Se corre después de cada `migrate deploy`, como `db:app-role`. Así una tabla nueva queda protegida sola, y el CI (que crea el schema con `db push`) también las tiene. El backend verifica al arrancar que ninguna tabla haya quedado sin protección, y en producción no arranca si falta alguna.
- Prisma junta en una sola consulta los `findUnique` del mismo tick y los despacha con el contexto del primero que consultó. Con dos empresas en el mismo tick, la segunda recibía `null`. `separateBatchesByTenant` separa las tandas por empresa y despacha cada una con el contexto de quien la pidió. Usa partes internas de Prisma y falla al arrancar si cambian.
- En producción tampoco arranca con un usuario que se saltea RLS.
- `TENANT_RLS=off` apaga el filtro sin migraciones, como vuelta atrás de urgencia.
- Tests:
  - `tenant-isolation.int-spec.ts`, con el usuario sin privilegios: cada empresa ve solo lo suyo aunque la consulta no filtre; sin empresa no ve nada; escribir o modificar filas de otra empresa falla o no afecta nada; el modo plataforma ve todo.
  - El resto de las suites de integración y e2e corren con RLS activo. Las de integración arman sus datos en modo plataforma (`test/platform-context.setup.ts`).

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

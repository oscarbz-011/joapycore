# Plan de construcción — Series de facturación con modalidad manual (#57)

**Tarjeta:** https://trello.com/c/GVc1QN8X — la especificación funcional completa está ahí; este plan dice **cómo** construirla y en qué orden.
**Rama:** `feature/shared/57-billing-series`, desde `develop`, **después de mergear `refactor/shared/module-manifests`** (la tarjeta se apoya en el registro de módulos).
**Siguiente:** #58 (factura en el POS) usa `BillingSeries` y la caja con serie. Después va la fase B de la refactorización (eventos tipados) y recién ahí la etapa 2 de Facturación. Ver `2026-10-22-modular-architecture.md`.

**Tecnología:** NestJS 11, Prisma 7/PostgreSQL, Jest; Next.js 16, TanStack Query, shadcn, Vitest; pnpm.

## Decisiones que necesita el usuario antes de las tareas 3 y 6

1. **Facturas de interés con serie `PREPRINTED`.** Hoy `createInterestInvoiceFromReceipt` crea la factura de interés sola, ya en `PAID`, con el número "último + 1" del mismo talonario que las de venta. Con un talonario de imprenta nadie tipea ese número. Opciones:
   - (a) **Recomendada:** se crea en `PENDING` y se emite a mano como cualquier otra, cargando el número del talonario. Es coherente con el papel, pero queda trabajo manual por cada cobro con interés.
   - (b) El tenant tiene que tener además una serie `SELF_PRINTED` para los intereses.
   - (c) Con talonario no se genera factura de interés automática.
2. **Forma de la división de SIFEN.** La tarjeta dice: "`sifen` (núcleo) queda como Datos fiscales; se crea un complemento Facturación electrónica dueño de `SifenConfig`". Pero los datos fiscales viven en `Tenant` (plataforma) y en `Branch` (sucursales, núcleo): un módulo "Datos fiscales" quedaría vacío.
   - **Recomendación:** la carpeta `modules/sifen` pasa a ser directamente el complemento "Facturación electrónica" (clave `electronic-invoicing`, `addon`, depende de `billing`, dueño de `SifenConfig`). Los datos fiscales se quedan donde están.

## Decisión técnica (sin impacto de negocio)

**"Facturación se activa con Ventas"** se modela con un campo nuevo del manifiesto, `bundledWith: 'sales'`, y no con `kind: 'feature'`.
- En el registro, `feature` significa "usa la clave del padre en `@RequiredModule`". Comunicaciones guarda `@RequiredModule('billing')` y la fila `TenantModule` de `billing` tiene que seguir existiendo.
- Con `bundledWith`:
  - `billing` sigue siendo `addon` con su clave.
  - `TenantModulesService` lo activa y desactiva junto con Ventas y rechaza el toggle individual.
  - El catálogo lo expone para que el frontend muestre "Incluida con Ventas".

## Hallazgos del código que condicionan el diseño

- **`DocumentType` ya existe** (CI/RUC/PASSPORT, de clientes). El nuevo enum se llama `FiscalDocumentType` (`INVOICE` | `TICKET` | `CREDIT_NOTE`).
- **`Invoice` ya tiene** `establecimiento`, `puntoExpedicion`, `sequential`, `invoiceNumber` (7 dígitos) e `invoicePrefix`, con el único `[tenantId, establecimiento, puntoExpedicion, sequential]`. Las facturas se crean `PENDING` sin número (`BillingOnSaleListener`) y el número se asigna al emitir.
- **`issue()`** (`invoices.service.ts:44-215`):
  - La transacción 1 asigna el número con `findLastSequential + 1` y toma la factura con `claimIssue`.
  - Después, fuera de la transacción, se genera el PDF.
  - La transacción 2 finaliza la factura y encola `invoice.issued`.
  - Un reintento conserva el `sequential` ya asignado: eso evita huecos y hay que mantenerlo.
- **Las facturas de interés** usan el mismo "último + 1" (`invoices.service.ts:283-355`).
- **El PDF** imprime `factura.numero = invoicePrefix + invoiceNumber`, y las variables `timbrado.*` salen de `Tenant` (`documents/events/invoice-on-issue.listener.ts:188-191` y `interest-invoice-on-issue.listener.ts:153-156`).
- **El controller de SIFEN no tiene `@RequiredModule`.** Permisos `sifen:read` y `sifen:manage`.
- **Los permisos nuevos se siembran con una migración** `INSERT … ON CONFLICT DO NOTHING`, más la asignación a los roles de sistema (ejemplo: `migrations/20260929120000_seed_application_email_permissions`). También van en `permissions.constant.ts` y en `front/lib/permissions.ts`.
- **El CI usa `db push`, no las migraciones.** El SQL de la migración de datos **no lo prueba el CI**: hay que probarlo a mano contra una copia de la base (tarea 1).
- **En Configuración no hay ninguna pantalla con lista + alta + edición en rutas propias.** El patrón a seguir es `sales/customers/{new,[id]/edit}`.

## Reglas para todas las tareas

- **TDD:** primero el test que falla, después el código. Un commit por tarea, con sus tests.
- **Aislamiento por tenant:** `tenantId` en toda lectura y escritura de series. Test de que una sucursal o serie de otro tenant se rechaza.
- **Arquitectura:**
  - El manifiesto de `billing` declara `BillingSeries` en `owns`.
  - Ningún módulo fuera de `billing` lee `billing_series` directo: el POS (#58) lo hará por un contrato.
  - `module-boundary-debt.ts` no crece.
- **Coordinación:** no tocar archivos de `modules/logistics` ni la parte de entregas de `sale-orders.service.ts`, que están en la rama `delivery-stock-out`.

---

### Tarea 1 — Schema y migración

**Archivos:**
- `BACK/prisma/schema.prisma`
- `BACK/prisma/migrations/<fecha>_billing_series/migration.sql`
- `BACK/src/modules/billing/module.manifest.ts`

**Schema:**
- Enums `FiscalDocumentType` y `BillingModality` (`PREPRINTED`, `SELF_PRINTED`, `ELECTRONIC`).
- Modelo `BillingSeries` (`@@map("billing_series")`):
  - `tenantId`, `branchId`, `documentType`, `modality`;
  - `timbrado?`, `validFrom?`, `validUntil?` (nulos solo en una serie migrada sin timbrado: queda incompleta);
  - `establecimiento`, `puntoExpedicion`;
  - `rangeFrom`, `rangeTo`, `nextNumber?`;
  - `isActive`, `createdAt`, `updatedAt`;
  - `@@unique([tenantId, timbrado, establecimiento, puntoExpedicion, documentType])` y `@@index([tenantId, branchId, documentType, isActive])`.
- `Invoice` agrega:
  - `seriesId?` y `documentType` (default `INVOICE`);
  - la copia al emitir: `timbrado?`, `timbradoValidFrom?`, `timbradoValidUntil?`, `modality?`.
- `Invoice`: el único pasa a `@@unique([seriesId, sequential])`. Se borra el `[tenantId, establecimiento, puntoExpedicion, sequential]`, porque con un timbrado nuevo la numeración puede reiniciarse.

**Migración de datos (SQL):**
1. Una serie `SELF_PRINTED`/`INVOICE` por cada combinación (tenant, establecimiento, punto) que aparece en `invoices` o en `branches` con `codigo_establecimiento`.
   - `branchId`: la sucursal con ese código. Si no hay, la principal del tenant.
   - Timbrado y vigencia: los del tenant. `rangeFrom` = 1, `rangeTo` = 9999999.
   - `nextNumber` = mayor `sequential` de esa combinación + 1.
2. `UPDATE invoices SET series_id …` por (tenant, establecimiento, punto). Las facturas emitidas copian el timbrado del tenant.
3. **Las columnas `timbrado_*` de `tenants` se borran en la tarea 5**, no acá.

**Verificación:**
- `prisma validate` y `generate`.
- Aplicar la migración a una **copia de la base de desarrollo** (una base desechable clonada) y comprobar con SQL:
  - cantidad de series = combinaciones;
  - ninguna factura emitida sin `series_id`;
  - `next_number` correcto.

### Tarea 2 — Administración de series (backend)

**Archivos nuevos en `BACK/src/modules/billing/`:**
- `repositories/billing-series.repository.ts`
- `services/billing-series.service.ts`
- `controllers/billing-series.controller.ts`
- `dto/create-billing-series.dto.ts` y `dto/update-billing-series.dto.ts`
- Más una migración de permisos.

**Rutas** (`@RequiredModule('billing')`):
- `GET billing/series` y `GET billing/series/:id` (`billing:read`)
- `POST billing/series`, `PATCH billing/series/:id` y `POST billing/series/:id/deactivate` (`billing:series:manage`, permiso nuevo)

**Validaciones:**
- la sucursal es del tenant;
- `validFrom <= validUntil` y `rangeFrom <= rangeTo`;
- `ELECTRONIC` → 422 "Disponible con Facturación electrónica";
- `nextNumber` solo en `SELF_PRINTED`;
- el timbrado tiene 8 dígitos;
- establecimiento y punto tienen 3 dígitos.

**Otras reglas:**
- No se borra; se desactiva.
- Editar `rangeTo` por debajo del último número usado → 422.

**Tests:**
- Unitarios del servicio.
- E2E de guard y permiso.
- Integración: aislamiento entre tenants y único repetido.

### Tarea 3 — Numeración por serie (requiere la decisión 1)

**Archivos:**
- `services/invoices.service.ts`
- `repositories/invoices.repository.ts`
- `services/billing-series.service.ts` (`resolveFor` y `takeNextNumber`)
- `dto/issue-invoice.dto.ts` (`documentNumber?: number`)

**Resolución:** sucursal del pedido + `INVOICE` + fecha de emisión dentro de la vigencia + activa. Si no hay ninguna → 422 "No hay una serie de facturas vigente para la sucursal {nombre}". Si la serie está incompleta (sin timbrado) → 422 con el enlace a completarla.

**`SELF_PRINTED`:** incremento atómico dentro de la transacción 1:

```sql
UPDATE billing_series SET next_number = next_number + 1
WHERE id = $1 AND tenant_id = $2 AND next_number <= range_to
RETURNING next_number - 1 AS taken
```

Va con `$queryRaw` tipado. Si no hay fila → 422 "Se agotó el rango de la serie".

**`PREPRINTED`:** `documentNumber` obligatorio, dentro del rango, no usado en la serie (el único `[seriesId, sequential]` lo garantiza ante carreras: convertir el P2002 en 422) y fecha dentro de la vigencia.

**Otras reglas:**
- Se conserva el comportamiento actual: un reintento reutiliza `seriesId` y `sequential` ya asignados y no gasta otro número.
- Al emitir se copia a la factura el timbrado, la vigencia y la modalidad.
- `createInterestInvoiceFromReceipt` pasa a la serie, según la decisión 1.
- Se borra `findLastSequential`.

**Tests:**
- Unitarios: cada error.
- Reintento sin gastar número.
- **Integración** (`BACK/test/billing-series.int-spec.ts`): dos emisiones concurrentes toman números distintos y consecutivos; rango agotado; número `PREPRINTED` repetido; aislamiento entre tenants.

### Tarea 4 — PDF

**Archivos:**
- `documents/events/invoice-on-issue.listener.ts` e `interest-invoice-on-issue.listener.ts`
- `documents/constants/template-variables.constant.ts` y `default-templates.constant.ts`
- `documents/repositories/document-sources.repository.ts`

**Cambios:**
- Las variables `timbrado.*` salen de la copia en la factura, no de `Tenant`.
- Variable nueva `factura.leyendaModalidad`: vacía en `SELF_PRINTED` y "Copia interna – no válida como comprobante fiscal" en `PREPRINTED`. Se agrega a la plantilla por defecto.
- Esta es una lectura que Documentos ya hace de `Invoice` (deuda existente, no nueva).

**Tests:** los specs de los listeners con las dos modalidades.

### Tarea 5 — Sacar el timbrado de `Tenant`

**Archivos:**
- `tenants/dto/update-tenant.dto.ts` y `tenants/services/tenants.service.ts` (y su spec)
- `billing/repositories/invoices.repository.ts:25-27`
- `front/lib/api/tenants.ts` y `front/lib/api/billing.ts` (`InvoiceTenant`)
- `front/app/(dashboard)/dashboard/settings/tenant/page.tsx` (≈566-592)
- Una migración que borra `timbrado_numero`, `timbrado_fecha` y `timbrado_fecha_fin`

**Pantalla:** en el lugar donde estaba el timbrado aparece un aviso con un enlace a Configuración → Series.

**Tests:** `tenants.service.spec` sin timbrado; `tsc` del front.

### Tarea 6 — Activación con Ventas y división de SIFEN (requiere la decisión 2)

**Archivos:**
- `common/modules/module-manifest.ts` (campo `bundledWith?: string`)
- `modules/billing/module.manifest.ts` (`bundledWith: 'sales'`)
- `common/constants/modules.constant.ts`: el catálogo expone `bundledWith`, y el test de arquitectura verifica que apunte a un addon existente.
- `tenants/services/tenant-modules.service.ts`:
  - activar Ventas activa Facturación;
  - desactivar Ventas la desactiva (las dependencias de Pagos, Finanzas y POS ya lo bloquean);
  - el toggle directo de `billing` → 422 "Facturación se activa con Ventas".
- `modules/sifen/module.manifest.ts`: clave `electronic-invoicing`, `addon`, `depends: ['billing']`, dueña de `SifenConfig`.
- `@RequiredModule('electronic-invoicing')` en `sifen.controller.ts`.
- Una migración de datos:
  - activar `billing` donde `sales` está activo;
  - crear la fila `electronic-invoicing` activa para los tenants que ya tienen `SifenConfig`.
- `front/app/(dashboard)/dashboard/settings/modules/page.tsx`:
  - Facturación como "Incluida con Ventas", sin interruptor;
  - entrada "Facturación electrónica" con `settingsHref` a la pestaña SIFEN.
- `settings/page.tsx`: la pestaña SIFEN también exige el módulo activo.

**Tests:**
- `tenant-modules.service.spec`: activación conjunta, rechazo del toggle y desactivación.
- El test de arquitectura en verde.
- Integración: los tenants migrados conservan el acceso a SIFEN.

### Tarea 7 — Pantallas de series (frontend)

**Archivos:**
- `front/lib/api/billing-series.ts` (tipos y API)
- `front/lib/billing-series.ts` + `.test.ts` (validaciones del formulario, etiquetas, orden)
- `front/app/(dashboard)/dashboard/settings/billing-series/page.tsx`, `new/page.tsx` y `[id]/edit/page.tsx`
- `_form.tsx` siguiendo el patrón de `sales/customers`
- Entrada en el sidebar (Configuración) y regla en `route-access.ts`
- Permiso en `front/lib/permissions.ts`

**Tabla:**
- Paginada en el navegador (`usePagination` + `TablePagination`).
- Un dato por columna y todas ordenables (`useTableSort` + `SortableHeader`): Sucursal, Tipo, Modalidad, Timbrado, Vigencia desde, Vigencia hasta, Establecimiento, Punto, Rango desde, Rango hasta, Próximo número, Estado.
- Estados de carga, vacío y error, con los textos de la tarjeta.

**Formulario:**
- shadcn (Select con centinela).
- Fechas dd/mm/aa.
- Errores del servidor visibles.

**Tests:** Vitest de las funciones puras; prueba en el navegador del alta, la edición y la desactivación.

### Tarea 8 — Emitir y ver la factura (frontend)

**Archivos:**
- `front/app/(dashboard)/dashboard/billing/invoices/[id]/page.tsx` (sección "Emisión" ≈442-580 y la vista emitida ≈594-598)
- `front/lib/api/billing.ts` (`IssueInvoicePayload.documentNumber`, campos de serie en `Invoice`)
- Endpoint de vista previa `GET billing/invoices/:id/series` (de la tarea 3): la serie que se va a usar, o el error

**Comportamiento:**
- Antes de emitir se muestra la serie.
- Con `PREPRINTED`: campo obligatorio "Número del talonario" con el rango como ayuda, y los errores de número fuera de rango, repetido o con serie vencida.
- El detalle muestra timbrado, vigencia y modalidad.

**Tests:** Vitest de la validación del número; prueba en el navegador con las dos modalidades.

### Tarea 9 — Cierre

- `jest --runInBand` completo, integración en una base desechable, `tsc` y ESLint acotados.
- Front: Vitest, ESLint y `tsc` acotado.
- Prueba en el navegador: emitir con `SELF_PRINTED`, emitir con `PREPRINTED`, número repetido, serie vencida y rango agotado.
- Una entrada en `ARCHITECTURE.md`. La tarjeta #57 pasa a "En revisión" con lo verificado y lo no verificado.
- PR a `develop` con migraciones, impacto en el aislamiento por tenant, riesgos y vuelta atrás. **Vuelta atrás:** la migración de datos no es reversible sin un respaldo; tomar un `pg_dump` antes de desplegar.

## Riesgos

- **La migración de datos no la prueba el CI** (usa `db push`): por eso se prueba sobre una base clonada en la tarea 1.
- **Tenants sin timbrado:** no van a poder emitir hasta completar la serie. Es lo que pide la tarjeta, pero es un cambio visible: avisar antes de desplegar.
- **Facturas `PENDING` creadas antes del despliegue:** se emiten con la serie vigente del momento de la emisión.

# Plan de construcción — Arquitectura modular

**Objetivo:** que los módulos de JoapyCore se activen y desactiven de verdad, cada uno con su manifiesto, sus tablas, sus datos iniciales y sus extensiones de la UI, y que cada uno pueda separarse más adelante como servicio sin romper a los demás.

**Enfoque:** monolito modular primero. Cada módulo declara lo que es dueño y de qué depende, y un test lo hace cumplir. Los efectos entre módulos viajan como eventos tipados por el outbox. Un módulo nunca agrega columnas a la tabla de otro: si lo extiende, lo hace con su propia tabla 1:1.

**Coordinación con Facturación:** este plan se intercala con el de Facturación (`2026-10-22-billing-series.md`).

| Orden | Trabajo | Por qué en ese lugar |
|---|---|---|
| 1 | **Fase A**: cerrar `delivery-stock-out` y `module-manifests` | La #57 se apoya en el registro de módulos |
| 2 | #57: series de facturación | — |
| 3 | #58: factura en el POS | — |
| 4 | **Fase B**: eventos tipados y outbox por consumidor | La etapa 2 de Facturación es de eventos |
| 5 | Facturación, etapa 2 | — |
| 6 | **Fase C**: schema por módulo, frontend, crédito, deuda y datos | Cambios amplios: después de que se asiente el schema de Facturación |

## Reglas para trabajar en paralelo

- La refactorización se hace en el worktree `.worktrees/modular`. Facturación se hace en la carpeta principal.
- Mientras la #57 o la #58 estén abiertas, la refactorización no toca `BACK/src/modules/billing`, `BACK/src/modules/pos` ni el schema de esas tablas.
- Cuando dos ramas tocan el mismo archivo, entra primero la que va antes en el orden de arriba y la otra hace merge de `develop`.
- `module-boundary-debt.ts` solo puede achicarse. Si una rama nueva necesita leer una tabla ajena, lo hace por un contrato (`common/contracts`) o desde el repositorio de fuentes del módulo (`*-sources.repository.ts`).

---

## Fase A — Cerrar lo ya hecho

### A1. `fix/shared/delivery-stock-out` (2 commits, listo)

- [x] La cadena entrega → descuento de stock pasa por el outbox y es idempotente.
- [x] Ventas marca el pedido entregado cuando no hay Logística; con Logística activa, la entrega se cierra en Logística.
- [x] Al activar Logística se sincronizan las notas de entrega.
- [x] Tests unitarios, 6 de integración contra PostgreSQL y Vitest.
- [x] Prueba en el navegador con Logística apagada (2026-10-22): el pedido facturado se marca entregado desde el detalle, queda `DELIVERED`, el stock baja de 10 a 7, `sale.order.stock_out` queda `DONE` y no se crea ninguna nota de entrega. Sin errores de consola.
- [ ] Revisión independiente (gate review), push, PR a `develop` con el CI en verde, y tarjeta de Trello en "En revisión".

### A2. `refactor/shared/module-manifests` (1 commit, listo)

- [x] Manifiesto por carpeta, registro y `MODULE_CATALOG` generado (idéntico al anterior).
- [x] Test de arquitectura y la deuda congelada.
- [ ] Revisión, push, PR y tarjeta.
- **No se toca SIFEN en esta rama:** la división en "Datos fiscales" (núcleo) más el complemento "Facturación electrónica" es parte de la #57.

**Merge:** A2 puede entrar antes o después que A1, porque son independientes. Las dos tienen que estar en `develop` antes de empezar la #57.

---

## Fase B — Eventos tipados y outbox por consumidor

Rama: `refactor/shared/typed-events`. Va después de mergear la #58 y antes de la etapa 2 de Facturación.

**Hoy:**
- Unos 47 nombres de evento son strings sueltos, y cada listener redefine su propia interfaz del payload.
- El outbox guarda una fila por evento y se la despacha a todos los listeners juntos. Si uno falla, se reintentan todos.
- Pasan por el outbox `invoice.issued`, `sale.order.completed`, `sale.credit.approved` y `sale.payment.collected`. Después de A1 también `delivery.note.delivered` y `sale.order.stock_out`.

### B1. Catálogo de eventos tipado

**Archivos:**
- Crear `BACK/src/common/events/domain-events.ts`: un mapa `DomainEvents` de nombre de evento a payload, con `version` en cada payload.
- Crear `BACK/src/common/events/event-bus.ts`: wrapper sobre `EventEmitter2` con `emit<K extends keyof DomainEvents>(name, payload)`.
- Modificar los emisores y listeners para importar los tipos desde ahí. Ningún listener declara su propia interfaz.

**Tests:** un test de arquitectura que falle si aparece un `emit('…')` o un `@OnEvent('…')` con un nombre que no está en `DomainEvents`.

### B2. Outbox con una entrega por consumidor (patrón inbox)

**Schema:** tabla nueva `OutboxDelivery` (`eventId`, `consumer`, `status`, `attempts`, `nextAttemptAt`, `lastError`). Dueña: la plataforma.

**Comportamiento:**
- Al despachar, se crea una entrega por cada consumidor registrado para ese evento.
- Cada entrega reintenta por su cuenta.
- Un consumidor que ya respondió no se vuelve a llamar.

**Registro de consumidores:** decorador `@OnDomainEvent(name, { consumer: 'logistics.create-delivery-note' })`. El nombre del consumidor es estable y queda guardado en la base.

**Migración:** los eventos pendientes viejos (`PENDING`/`FAILED`) se reparten en entregas al desplegar.

**Tests de integración:**
- Si un consumidor falla, el otro no se reintenta.
- Un reintento llama solo al que falló.
- Desplegar con eventos pendientes no los pierde.

### B3. Listeners que respetan la activación

- Se agrega la opción `@OnDomainEvent(…, { module: 'logistics' })`, que saltea el evento si el módulo está inactivo para el tenant (`TenantModulesCache.isActive`).
- Se aplica primero en Logística, reemplazando el chequeo manual de A1.
- **Facturación no lo necesita:** se activa con Ventas (decisión del 2026-10-21, ver #57).
- **Decisión pendiente del usuario:** qué hacen Finanzas y Pagos cuando están apagados.

**Criterio de aceptación de la fase B:** la etapa 2 de Facturación se escribe sin `emit('string')` sueltos y con entrega por consumidor.

---

## Fase C — Después de la #57 y la #58

Cada punto es una rama y un PR propios. El orden sugerido es este; se ajusta al empezar cada uno.

### C1. Schema de Prisma por módulo

- `prisma/schema.prisma` pasa a `prisma/schema/` con un archivo por dueño (`sales.prisma`, `billing.prisma`, `platform.prisma`, …). Prisma 7 lo soporta y `prisma.config.ts` apunta a la carpeta.
- El test de arquitectura comprueba que cada modelo esté en el archivo de su dueño.
- Las relaciones nuevas entre módulos se hacen solo por ID, sin `@relation`. Las existentes se quedan como están.
- **Riesgo:** choca con cualquier rama que toque el schema. Hacerlo en un momento sin ramas abiertas que cambien el schema.

### C2. Frontend: catálogo y navegación desde los manifiestos

- Endpoint `GET /tenants/modules/catalog` con los manifiestos `addon` y `feature` (nombre, ícono, dependencias, estable o no).
- `settings/modules/page.tsx` deja de tener su propia copia del catálogo.
- Un manifiesto de frontend por módulo (`front/modules/<clave>/manifest.ts`) con las entradas del menú y las reglas de ruta. `sidebar.tsx` y `route-access.ts` se generan desde ahí y desaparece la duplicación.
- **Slots** (`<Slot name="sale-order.detail.aside" />`), para que un módulo agregue paneles en la pantalla de otro. El primer caso es el panel "Entrega" de Logística en el detalle del pedido.

### C3. Evaluación de crédito → Finanzas

- `CreditEvaluationService`, `CreditConfig` y la pantalla del analista pasan a Finanzas. Ventas conserva los estados del pedido y los garantes.
- Las decisiones viajan por eventos tipados con outbox: `credit.approved`, `credit.rejected` y `credit.adjustment_requested`.
- Ventas pregunta por el crédito disponible y el precio financiado a un puerto `CREDIT_TERMS`. Con Finanzas apagada, el puerto responde "sin crédito".
- Se borra `sales/repositories/credit-sources.repository.ts`, así que Ventas deja de leer `Loan` e `Installment`.
- **Tests de regresión del ciclo completo:** pedir, ajustar, aprobar, facturar y generar las cuotas.

### C4. Bajar la deuda de límites (primero las escrituras)

| Escritura ajena | Reemplazo |
|---|---|
| Documentos escribe `pdfFileId` en facturas, pedidos, recibos y OC | Evento `document.pdf.generated`; cada dueño guarda su `pdfFileId` |
| RRHH crea usuarios y roles | Puerto `USER_ACCOUNTS` implementado por `users/` |
| Inventario escribe `SaleOrderItem.batchId` | Evento `inventory.batch.consumed`, que escucha Ventas |
| Logística corrige coordenadas de `Customer` | Evento `delivery.location.corrected`, que escucha Ventas |
| Finanzas escribe `DelinquencyReport` | Mover el cálculo de mora a Cobranzas, o pasar el dueño a Finanzas (decidir) |

Después vienen las lecturas, que pasan a `*-sources.repository.ts` o a contratos.

### C5. Datos iniciales declarativos por módulo

- Una carpeta `data/` por módulo (JSON) que se aplica en `tenant.module.activated` y en `tenant.registered`.
- Tabla `TenantModuleData` (`tenantId`, `module`, `dataVersion`). Solo crea lo que falta y nunca pisa lo que el tenant ya editó.
- Casos para migrar: las categorías por defecto de Inventario (hoy solo en el registro), las plantillas de Documentos y las categorías de Documentos.

## Verificación de cada rama

- Backend: `jest --runInBand` completo, `tsc` y ESLint sobre los archivos tocados, e integración contra una base desechable cuando haya transacciones o eventos.
- Frontend: Vitest, ESLint, `tsc` acotado y prueba en el navegador si cambia la UI.
- El test de arquitectura en verde, sin entradas nuevas en la deuda.

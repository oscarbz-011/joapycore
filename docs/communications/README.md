# Centro de Comunicaciones — primera vertical

Implementación del primer incremento de la sección 24 del build plan (18/09/2026). Esta entrega comprende **factura emitida → intención persistida → BullMQ → SMTP → historial y notificación privada**, más notas internas en la factura. No equivale a completar las fases 0–3 ni el roadmap completo.

## Funcionalidad

- Aplicaciones → Centro de comunicaciones: entregas, detalle e intentos, notificaciones personales y configuración por empresa.
- La antigua ruta frontend `/dashboard/applications/email` redirige al centro. El backend registra tanto `ApplicationsModule` como `CommunicationHubModule`: las rutas anteriores de Aplicaciones (incluido el buzón IMAP) siguen activas y autorizadas. La copia del frontend anterior permanece en `applications/email/legacy-email.tsx`, sin ruta propia.
- Remitente de sistema/compartido, nombre visible y `Reply-To`. El adaptador inicial utiliza la integración SMTP cifrada existente por tenant. La dirección debe coincidir con el remitente autorizado allí; esta entrega no incorpora conexiones múltiples ni buzones personales.
- Plantilla `INVOICE_ISSUED` versionada, vista previa y variables permitidas. Texto plano: no se ejecutan expresiones ni se interpreta HTML.
- Botón de envío y timeline paginado con notas internas en la ficha de factura.
- Envío automático opcional al recibir el evento `invoice.issued`, que Billing ya guarda mediante Outbox en su transacción de emisión. Se conserva ese nombre para no romper sus consumidores.
- Flags `enabled`, `emailEnabled`, `invoiceEmailEnabled` desactivados por defecto. No se activan tenants ni se envían correos al instalar la migración.

## Puesta en marcha

1. Instalar las dependencias de BACK con `pnpm install --frozen-lockfile` y ejecutar `pnpm exec prisma generate`.
2. Aplicar `BACK/prisma/migrations/20260918010000_communications_vertical/migration.sql` mediante el procedimiento de migraciones del despliegue. La historia previa tiene una limitación de reproducción desde cero documentada en CI: no resolverla con `db push` sobre una base de trabajo. Probar la migración sobre copia antes del despliegue.
3. Iniciar Redis de desarrollo con `docker compose up -d redis`. Queda publicado únicamente en loopback. Para producción usar instancia privada con autenticación/TLS según el entorno.
4. Configurar `REDIS_URL` y `COMMUNICATIONS_WORKER_ENABLED=true` en los procesos que ejecutan workers. El worker corre en el módulo Nest y puede habilitarse en instancias seleccionadas; aún no hay binario independiente.
5. Reiniciar backend/frontend. La migración otorga los nuevos permisos a roles de sistema; asignar explícitamente permisos al resto de usuarios. Puede ser necesario renovar la sesión para actualizar la navegación del frontend.
6. En Integraciones, configurar y probar el SMTP del tenant. En el centro, crear identidad predeterminada, publicar plantilla y activar las capacidades. Habilitar la automatización solamente cuando el remitente y los destinatarios estén listos.

Los endpoints de facturas requieren además `billing:read` y el módulo Billing activo. Notas requieren `communications:notes:create`; reintentos requieren permisos de lectura y envío. La configuración requiere `communications:settings:manage`. El acceso general requiere `communications:access`.

## Persistencia y estados

`communication_messages` actúa como Outbox de entrega durable: su fila incluye destinatario, contenido renderizado, identidad y versión de plantilla, y el `pdfFileId` original. El PDF se lee mediante Files y se comprueba su pertenencia a la factura y su checksum. No se regenera al enviar.

La clave única `(tenantId, invoice:<id>:issued)` unifica el envío manual, el automático y las redeliveries del evento. No permite enviar deliberadamente varias copias de la misma factura. Un reintento opera sobre la fila original.

El dispatcher consulta PostgreSQL cada 10 segundos; perder Redis no pierde la intención de envío. La toma del trabajo y el contador/intento se confirman en una transacción con actualización condicional. El worker vuelve a validar tenant, Billing activo, configuración e identidad.

| Estado     | Significado                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------- |
| QUEUED     | Pendiente o esperando backoff de un rechazo confirmado                                         |
| PROCESSING | Un worker tomó el intento                                                                      |
| SENT       | SMTP aceptó el destinatario y el mensaje; no prueba entrega ni lectura                         |
| FAILED     | Fallo confirmado tras los intentos automáticos; permite reintento manual                       |
| UNKNOWN    | Resultado incierto o worker interrumpido; requiere revisión del proveedor y no permite reenvío |

Hasta cinco intentos automáticos con backoff exponencial. Un intento manual adicional queda auditado. La base y SMTP no comparten transacción: no se promete exactamente una entrega externa. Se usa Message-ID estable y se evita reintentar automáticamente una aceptación incierta. Un registro PROCESSING de más de 15 minutos pasa a UNKNOWN.

Las notificaciones de mensajes se guardan en la misma transacción que el mensaje o el resultado del intento y solo son visibles al usuario destinatario. Las consultas filtran por tenant y usuario autenticado. Los eventos `communication.*`/`communications.*` no se difunden mediante el bridge WebSocket general. La UI actualiza por REST periódicamente.

Los errores determinísticos previos al encolado automático (por ejemplo, destinatario, identidad, plantilla o PDF faltante) no crean una entrega ni hacen reintentar el Outbox compartido de `invoice.issued`. Si el evento identifica al usuario emisor, se guarda para él una notificación privada e idempotente con un motivo sanitizado. Sin usuario emisor no se fabrica un destinatario. Un fallo inesperado de base de datos o al persistir esa notificación sí rechaza el evento para que el Outbox lo reintente. El envío manual conserva sus errores HTTP para que el usuario corrija la preparación.

## API de este incremento

Prefijo `/communications`:

- `GET/PATCH settings`.
- `GET/POST identities`, `PATCH/DELETE identities/:id`.
- `GET templates`, `POST templates/versions`, `POST templates/preview`.
- `GET messages?page=1&limit=20&status=FAILED`, `GET messages/:id`, `POST messages/:id/retry`.
- `POST invoices/:id/send`.
- `GET timeline/INVOICE/:id?page=1&limit=20`, `POST timeline/INVOICE/:id/notes` con `{body}`.
- `GET notifications?page=1&limit=20`, `POST notifications/:id/read`.

Los DTO rechazan propiedades desconocidas; el cliente no elige `tenantId`, autor, propietario de notificación, PDF ni destinatario de factura. Las listas devuelven `{items,total,page,limit}`; notificaciones incluyen `unreadCount`.

## Verificación

```powershell
# Desde BACK
pnpm exec tsc --noEmit
pnpm test --runInBand communications smtp-adapter app-validation.pipe ws-bridge.listener invoices.service.spec outbox.service.spec

# Verificar primero el servicio postgres de este Compose y reservar
# únicamente joapycore_comms_test_local; usar Redis DB 15, separada de DB 0.
# Desde la raíz: docker compose config --services; docker compose ps
# Desde la raíz: docker compose up -d postgres redis
# Desde la raíz: docker compose exec -T postgres createdb -U joapycore joapycore_comms_test_local
# Desde la raíz: docker compose exec -T redis redis-cli -n 15 DBSIZE  # debe ser 0
$env:DATABASE_URL='postgresql://joapycore:joapycore@localhost:5435/joapycore_comms_test_local'
$env:COMMUNICATIONS_TEST_DATABASE_URL=$env:DATABASE_URL
$env:COMMUNICATIONS_TEST_REDIS_URL='redis://127.0.0.1:6379/15'
pnpm exec prisma db push
pnpm test:int --testPathPatterns=communications.int-spec
Remove-Item Env:DATABASE_URL,Env:COMMUNICATIONS_TEST_DATABASE_URL,Env:COMMUNICATIONS_TEST_REDIS_URL

# Desde front
pnpm exec tsc --noEmit
pnpm test lib/route-access.test.ts
```

La prueba de integración exige un nombre de base `joapycore_comms_test_*`, crea fixtures con UUID y elimina solamente sus fixtures incluso ante fallos de aserción. Para Redis exige DB 15 vacía antes de empezar; rechaza una DB 15 con claves preexistentes y, si la reservó, la limpia al cerrar el worker incluso ante fallos. DB 0 no se toca. Usa PostgreSQL y opcionalmente Redis/BullMQ reales; el adaptador SMTP y la lectura física del PDF se simulan. Sin la variable de base de integración, el suite se omite para evitar escribir en la base habitual. El schema debe estar aplicado previamente. Nunca aplicar `db push` a una base de desarrollo o producción.

La suite aislada comprueba deduplicación concurrente, límites por tenant/usuario, intentos fallidos, estado `UNKNOWN` y transporte BullMQ cuando se proporciona Redis. Ninguna ejecución de esa suite equivale a comprobar entrega SMTP real o revisión visual en navegador.

## Recuperación y siguientes incrementos

Supervisar los estados `QUEUED` vencidos, `PROCESSING` de más de 15 minutos, `FAILED` y `UNKNOWN`, junto con los códigos `communications.queue.unavailable`, `communications.worker.unavailable` y `communications.dispatch.failed` en logs. Revisar las notificaciones privadas de preparación automática y los intentos registrados antes de intervenir. Si Redis falla, conservar PostgreSQL y restablecer el servicio: el dispatcher retomará las intenciones pendientes. Ante `FAILED`, corregir la causa y usar el reintento autorizado. Ante `UNKNOWN`, comprobar primero en el proveedor SMTP si hubo aceptación; el sistema no lo reenvía automáticamente. Si falla la persistencia de una notificación de preparación, revisar también los reintentos del Outbox de `invoice.issued`.

La migración es aditiva y preserva mensajes e integraciones anteriores. Para volver al código previo: desactivar automatizaciones y worker, esperar los intentos activos y desplegar la versión anterior. Conservar las tablas nuevas y su auditoría; no borrar estados `UNKNOWN` para provocar reenvíos. Restaurar una copia verificada si se necesita revertir datos.

Pendiente del roadmap: conversaciones externas y enlaces genéricos, actividades/preferencias, chat, otros documentos/RFQ y reglas configurables, conexiones múltiples, webhooks y supresiones, WhatsApp, llamadas, marketing y escalado de Socket.IO. El buzón IMAP anterior de Aplicaciones sigue activo en el backend; la recepción unificada en el Centro de Comunicaciones aún no existe. Los correos del módulo Documentos siguen usando su servicio existente.

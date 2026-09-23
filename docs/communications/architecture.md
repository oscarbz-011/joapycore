# ADR — Centro de Comunicaciones, incremento 1

Estado: implementado para la vertical de facturas; decisiones de canales futuros pendientes.

## communications-architecture

`CommunicationHubModule` ofrece las consultas y comandos del centro y convive con `ApplicationsModule`, que sigue exponiendo los endpoints anteriores de correo/IMAP. Solo la URL antigua del frontend redirige al centro. HubService aplica los permisos del caso junto con los guards existentes; CommunicationsService maneja la intención y el ciclo de entrega; CommunicationsRepository concentra su persistencia; CommunicationsEmailProvider encapsula Nodemailer. Billing conserva propiedad de emisión, Documents del PDF y Files del almacenamiento. Se usan las dependencias existentes sin ciclo de importación hacia Billing.

Las referencias a entidades se mantienen escalares entre módulos, como OutboxEvent. Se validan por tenant antes de escribir/enviar. PostgreSQL conserva el historial, las notificaciones y las claves de deduplicación; Redis transporta trabajos recuperables desde PostgreSQL. El esquema del roadmap completo se introducirá cuando cada canal necesite sus invariantes, sin crear tablas vacías para funcionalidades inexistentes.

La creación de la intención y su notificación inicial es transaccional; el `(tenantId, idempotencyKey)` único une solicitudes manuales, automáticas y redeliveries. El claim condicional crea un intento y cuenta la ejecución en una transacción. Un fallo SMTP confirmado se registra y puede esperar backoff; un resultado ambiguo o una interrupción prolongada pasa a `UNKNOWN` y exige revisión humana antes de cualquier reenvío. `SENT` significa aceptación por SMTP, no entrega al destinatario. Los errores determinísticos de preparación automática se convierten en notificaciones privadas sanitizadas para `issuedById` sin rechazar el Outbox compartido. Los fallos inesperados de persistencia o infraestructura sí propagan el error para que el Outbox reintente.

## email-provider-abstraction

Primer proveedor: SMTP del tenant existente, cuyas credenciales ya están cifradas mediante INTEGRATIONS_ENCRYPTION_KEY. La interfaz TransactionalEmail transporta contenido, Reply-To y archivo, sin dependencias de SDK en Billing. Los errores del adaptador son códigos/mensajes controlados, nunca la respuesta SMTP íntegra ni secretos. El asunto no acepta saltos de línea y las plantillas son texto plano.

Se mantienen filas/versiones inmutables de contenido enviado. SMTP no ofrece una confirmación transaccional con PostgreSQL: ante incertidumbre se detiene la repetición (UNKNOWN). Una futura API transaccional con idempotencia propia podrá mejorar esa garantía y ofrecer webhooks firmados de entrega.

## realtime-and-socketio

La primera vertical usa REST autenticado y refresco periódico. No se reutiliza el room general de tenant para mensajes o notificaciones privadas. La siguiente fase de Collaboration deberá validar sesión vigente, tenant y membresía en cada comando/room, persistir antes de emitir y permitir recuperar historial vía REST. Redis adapter y presencia distribuida se incorporarán con chat, no están implementados en esta entrega.

## webrtc-and-telephony

Pospuesto hasta la fase correspondiente. No se selecciona un proveedor TURN, SFU o PBX por inferencia ni se configuran servicios externos. Requerirá decisiones de despliegue, credenciales, límites, retención y consentimiento para grabaciones. El gateway de eventos no transportará audio.

# JoapyCore

ERP SaaS modular construido con NestJS y Next.js. Diseñado como un monolito multi-tenant que puede evolucionar hacia microservicios por módulo.

## Estructura del repositorio

```
JoapyCore/
├── BACK/          # API REST — NestJS + Prisma + PostgreSQL
├── front/         # Interfaz web — Next.js + TailwindCSS
└── docker-compose.yml
```

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | NestJS · TypeScript · Prisma · PostgreSQL |
| Frontend | Next.js · TailwindCSS · TanStack Query · shadcn (Base UI) |
| Auth | JWT (access) + refresh token opaco rotativo |
| Tareas programadas | `@nestjs/schedule` (cron, zona America/Asuncion) |
| Tiempo real | Socket.IO (namespace `/notifications`) |
| Archivos | Disco local o S3/MinIO (`STORAGE_DRIVER`) |
| Documentos | Puppeteer (HTML → PDF) · Gotenberg (DOCX → PDF) |
| API Docs | Swagger (`/docs`, desactivado en producción) |
| Infraestructura | Docker Compose: PostgreSQL, MinIO, Maildev, Gotenberg |

No hay Redis ni BullMQ: los procesos asíncronos son eventos en memoria (`@nestjs/event-emitter`) y crons.

## Módulos de negocio

| Módulo | Descripción |
|---|---|
| **Sales** | Clientes, pedidos contado/crédito, presupuestos, combos, metas |
| **Billing** | Facturas y notas de crédito |
| **Finance** | Préstamos, cuotas, mora e intereses |
| **Collections** | Rutas de cobranza, visitas, acuerdos y morosos |
| **Payments** | Cuentas por cobrar y cobros |
| **POS** | Terminales, sesiones de caja y ventas de mostrador |
| **Inventory** | Productos, stock (serializado y por cantidad), lotes, movimientos |
| **Procurement** | Proveedores, catálogo de precios, órdenes de compra, recepciones, cuentas por pagar |
| **Production** | Recetas y órdenes de producción |
| **Logistics** | Notas de entrega, reparto y seguimiento |
| **HR** | Empleados, áreas y cargos, licencias y vacaciones, nómina |
| **Documents** | Plantillas, contratos y documentos generados |
| **SIFEN** | Facturación electrónica (Paraguay) — configuración |
| **Credit Bureau** | Consultas de buró para evaluación de crédito |
| **Audit · Alerts · Reports · Files** | Transversales |
| **Applications · Integrations** | Correo y herramientas permanentes de productividad; conexiones externas opcionales por tenant |

## Inicio rápido

### Requisitos

- Node.js 20+
- pnpm 10+
- Docker y Docker Compose

### 1. Levantar infraestructura

```bash
docker compose up -d
```

### 2. Backend

```bash
cd BACK
cp .env.example .env   # completar variables (ver abajo)
pnpm install
pnpm prisma migrate deploy
pnpm prisma db seed     # permisos
pnpm seed:demo          # opcional: tenants de demostración
pnpm start:dev
```

API en `http://localhost:3000` · Swagger en `http://localhost:3000/docs`

El backend **no arranca** si faltan `DATABASE_URL`, `JWT_ACCESS_SECRET` o `TEMP_PASSWORD_KEY` (los secretos, de al menos 32 caracteres). Generar uno con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

En producción además son obligatorias `NODE_ENV=production` y `CORS_ORIGINS` (orígenes del front separados por coma). Detrás de un proxy, definir `TRUST_PROXY` para que el rate limiting vea la IP real.

### 3. Frontend

```bash
cd front
pnpm install
pnpm dev
```

App en `http://localhost:3001`

## Tests

```bash
cd BACK
pnpm test         # unitarios (Jest)
pnpm test:int     # integración contra la base de .env (concurrencia de stock y licencias)
pnpm lint         # ESLint + Prettier

cd ../front
pnpm lint
pnpm build
```

En máquinas con poca memoria conviene `--runInBand` y `NODE_OPTIONS=--max-old-space-size=1536`.

## Multi-tenancy

Cada tenant tiene sus propios datos, módulos activos y roles. El `tenantId` se extrae del JWT en cada request y toda consulta se acota a ese tenant. El estado de la sesión (usuario activo, empresa activa, permisos vigentes) se revalida en cada request con un caché de 30 segundos.

## Comunicación entre módulos

Los efectos entre módulos se disparan con eventos (`@nestjs/event-emitter`):

```
sale.order.completed
  → billing: crea factura
      → invoice.issued
          → payments: crea cuenta por cobrar
          → inventory: registra salida de stock
              → audit: registra movimiento
```

## Licencia

Privado — todos los derechos reservados.

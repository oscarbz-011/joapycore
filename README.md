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
| Frontend | Next.js · TailwindCSS · TanStack Query |
| Auth | JWT (access + refresh tokens) |
| Cache / Colas | Redis · BullMQ |
| API Docs | Swagger (`/docs`) |
| Infraestructura | Docker · Docker Compose |

## Módulos de negocio

| Módulo | Descripción |
|---|---|
| **Sales** | Órdenes de venta, clientes, cotizaciones |
| **Billing** | Facturación, emisión y cancelación de facturas |
| **Inventory** | Productos, stock (serializado y por cantidad), movimientos |
| **Procurement** | Órdenes de compra, recepción de mercadería |
| **Payments** | Cuentas por cobrar, registro de pagos |
| **HR** | Empleados, nómina |
| **Audit** | Registro de auditoría de acciones del sistema |
| **Alerts** | Configuración de alertas por módulo y canal |
| **Reports** | Reportes de ventas, stock y cuentas por cobrar |
| **Files** | Gestión de archivos (MinIO) |
| **Notifications** | Envío de emails y WhatsApp vía colas BullMQ |

## Inicio rápido

### Requisitos

- Node.js 20+
- pnpm 9+
- Docker y Docker Compose

### 1. Levantar infraestructura

```bash
docker compose up -d
```

### 2. Backend

```bash
cd BACK
cp .env.example .env   # completar variables de entorno
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm start:dev
```

API disponible en `http://localhost:3000` · Swagger en `http://localhost:3000/docs`

### 3. Frontend

```bash
cd front
pnpm install
pnpm dev
```

App disponible en `http://localhost:3001`

## Multi-tenancy

Cada tenant tiene sus propios datos, módulos activos y roles. El `tenantId` se extrae del JWT en cada request — ninguna query llega a la base de datos sin estar acotada al tenant.

## Comunicación entre módulos

Los módulos de negocio no se importan entre sí. Toda interacción cross-módulo ocurre a través de eventos (`@nestjs/event-emitter`):

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

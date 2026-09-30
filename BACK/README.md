# JoapyCore — Backend

API REST del ERP SaaS modular construido con NestJS. Arquitectura multi-tenant donde cada módulo de negocio puede habilitarse o deshabilitarse por tenant en tiempo de ejecución.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | NestJS 11 + TypeScript |
| ORM | Prisma 7 |
| Base de datos | PostgreSQL 16 |
| Auth | JWT (access + refresh token con rotación) |
| Eventos | @nestjs/event-emitter |
| Docs | Swagger (`/docs`) |
| Package manager | pnpm |

## Requisitos

- Node.js 20+
- pnpm
- Docker (para PostgreSQL)

## Configuración inicial

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Levantar la base de datos (desde la raíz del monorepo)
docker compose up -d

# 3. Instalar dependencias
pnpm install

# 4. Ejecutar migración inicial
pnpm exec prisma migrate deploy

# 5. Cargar catálogo de permisos
pnpm exec prisma db seed
```

## Comandos

```bash
pnpm start:dev      # Desarrollo con hot reload
pnpm build          # Compilar a dist/
pnpm start:prod     # Ejecutar build compilado

pnpm test           # Tests unitarios
pnpm test:cov       # Cobertura
pnpm lint           # ESLint con auto-fix
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `JWT_ACCESS_SECRET` | Secreto del access token |
| `JWT_REFRESH_SECRET` | Secreto del refresh token |
| `JWT_ACCESS_EXPIRES_IN` | Duración del access token (ej. `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Duración del refresh token (ej. `7d`) |
| `PORT` | Puerto del servidor (default `3000`) |
| `INTEGRATIONS_ENCRYPTION_KEY` | Clave de al menos 32 caracteres para cifrar credenciales de integraciones por tenant |

## Estructura

```
src/
├── common/          # Guards, decoradores, filtros, pipes compartidos
├── prisma/          # PrismaService y módulo global
├── auth/            # JWT, refresh tokens, registro y login
├── users/           # Usuarios y roles con RBAC por tenant
├── tenants/         # Tenants y gestión de módulos activos
└── modules/         # Módulos de negocio (sales, inventory, billing…)
```

## Multi-tenancy

Cada query a la base de datos está scopeada por `tenantId`. El decorador `@CurrentTenant()` lo extrae del JWT. Los repositorios siempre reciben `tenantId` como primer argumento.

## Autenticación

- `POST /auth/register` — crea tenant + usuario owner en una transacción
- `POST /auth/login` — devuelve access token (15m) + refresh token (7d)
- `POST /auth/refresh` — rota el refresh token y emite nuevos tokens
- `POST /auth/logout` — revoca el refresh token

Permisos y módulos activos viajan embebidos en el JWT. Los guards leen solo el payload — sin hit a la base de datos por request.

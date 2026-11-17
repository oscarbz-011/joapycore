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

# 2. Levantar la base de datos (desde la raíz del monorepo, con su .env
#    copiado de .env.example; DATABASE_URL usa esa misma clave)
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
| `DATABASE_URL` | Conexión de la app a PostgreSQL, con un usuario sin privilegios |
| `MIGRATE_DATABASE_URL` | Conexión del dueño de las tablas: la usan las migraciones y `pnpm db:app-role`. Sin ella, todo usa `DATABASE_URL` |
| `JWT_ACCESS_SECRET` | Secreto del access token |
| `JWT_REFRESH_SECRET` | Secreto del refresh token |
| `JWT_ACCESS_EXPIRES_IN` | Duración del access token (ej. `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Duración del refresh token (ej. `7d`) |
| `PORT` | Puerto del servidor (default `3000`) |
| `INTEGRATIONS_ENCRYPTION_KEY` | Clave de al menos 32 caracteres para cifrar credenciales de integraciones por tenant |

## Usuario de la base

La app no se conecta como dueño de las tablas ni como superusuario: un superusuario puede borrar tablas y se saltea cualquier política de filas. Hay dos usuarios:

- **Dueño** (`MIGRATE_DATABASE_URL`): crea y modifica las tablas. Solo lo usan las migraciones y `pnpm db:app-role`.
- **App** (`DATABASE_URL`): lee y escribe datos en todas las tablas de `public` menos `_prisma_migrations`. No puede crear tablas, bases ni usuarios.

`pnpm db:app-role` crea el usuario de la app con el nombre y la clave de `DATABASE_URL`, o lo actualiza si ya existe. Si el usuario ya existía con otros permisos o heredaba otros roles, se los quita. Se puede correr las veces que haga falta, y falla si `DATABASE_URL` y `MIGRATE_DATABASE_URL` apuntan a bases distintas o usan el mismo usuario.

Las tablas que creen las migraciones futuras ya nacen con permisos, siempre que las migraciones corran con el mismo dueño. Por eso, **después de cada `prisma migrate deploy` se vuelve a correr `pnpm db:app-role`**: la tabla de historial de migraciones también nace con permisos y el script es el que se los quita.

Al arrancar, el backend avisa en el log si `DATABASE_URL` usa un superusuario, un usuario que se saltea las políticas de filas, el dueño de las tablas o un usuario que puede crearlas.

### Pasar un entorno al usuario de la app

1. En el `.env`, mover la conexión actual a `MIGRATE_DATABASE_URL` y poner en `DATABASE_URL` el usuario nuevo con una clave propia:

   ```bash
   MIGRATE_DATABASE_URL="postgresql://joapycore:<clave-actual>@localhost:5435/joapycore"
   DATABASE_URL="postgresql://joapycore_app:<clave>@localhost:5435/joapycore"
   ```

2. Correr `pnpm db:app-role`. Repetirlo después de cada `prisma migrate deploy`.
3. Reiniciar el backend. El aviso del log ya no aparece.

En producción:

- Para crear el usuario, el dueño necesita el atributo `CREATEROLE`. Para modificarlo después, además tiene que haberlo creado él. Si no se cumple alguna de las dos cosas, `pnpm db:app-role` lo corre un superusuario. Esto solo se probó con un dueño superusuario, que es el caso de desarrollo y de CI.
- Con PostgreSQL 14 o anterior, cualquier usuario puede crear tablas en `public`. En ese caso `pnpm db:app-role` falla y avisa. Se resuelve una vez, como administrador: `REVOKE CREATE ON SCHEMA public FROM PUBLIC;`.
- La clave del usuario de la app viaja en la sentencia `ALTER ROLE`. Si el servidor registra las sentencias DDL (`log_statement`), la clave queda en su log: conviene correr el script con ese registro apagado.
- El proceso de la app recibe solo `DATABASE_URL`. `MIGRATE_DATABASE_URL` queda en el paso de despliegue que corre `prisma migrate deploy`.

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

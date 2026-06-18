# JoapyCore — Frontend

Interfaz web del ERP SaaS modular construida con Next.js 16. Se conecta al backend de JoapyCore y adapta la navegación según los módulos activos del tenant.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| Server state | TanStack Query 5 |
| Formularios | React Hook Form + Zod |
| HTTP | Axios (con interceptor de auto-refresh) |
| Íconos | Lucide React |
| Package manager | pnpm |

## Requisitos

- Node.js 20+
- pnpm
- Backend de JoapyCore corriendo en `http://localhost:3000`

## Configuración inicial

```bash
# 1. Copiar variables de entorno
cp .env.local.example .env.local

# 2. Instalar dependencias
pnpm install

# 3. Levantar en modo desarrollo
pnpm dev
```

La app queda disponible en `http://localhost:3001` (si el puerto 3000 está ocupado por el backend).

## Variables de entorno

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL base del backend (default `http://localhost:3000`) |

## Comandos

```bash
pnpm dev        # Desarrollo con hot reload
pnpm build      # Build de producción
pnpm start      # Servir build de producción
pnpm lint       # ESLint
```

## Estructura

```
app/
├── (auth)/          # Páginas de login y registro (rutas públicas)
├── (dashboard)/     # Shell del dashboard protegido por auth
│   ├── components/  # Sidebar y componentes del layout
│   └── page.tsx     # Página de inicio
├── providers.tsx    # QueryClientProvider + AuthProvider
└── layout.tsx       # Layout raíz

lib/
├── api/
│   ├── client.ts    # Axios con interceptores (Bearer + auto-refresh en 401)
│   └── auth.ts      # Llamadas a /auth/*
├── auth-context.tsx # AuthProvider y hook useAuth
└── token-store.ts   # Access token en memoria, refresh token en localStorage

types/
└── auth.ts          # Interfaces User, AuthTokens, JwtPayload, DTOs
```

## Flujo de autenticación

1. El usuario se registra (`/register`) o inicia sesión (`/login`)
2. El backend devuelve access token (15m) + refresh token (7d)
3. El access token se guarda en memoria; el refresh token en `localStorage`
4. Al montar la app, si hay refresh token se renueva automáticamente el access token
5. Axios intercepta los 401 y reintenta con un nuevo par de tokens transparentemente
6. El sidebar muestra con candado los módulos inactivos del tenant (leídos desde el JWT)

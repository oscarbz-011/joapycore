# JoapyCore — Frontend

Interfaz web del ERP SaaS modular construida con Next.js 16. Se conecta al backend de JoapyCore y adapta la navegación según los módulos activos y permisos del tenant.

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
front/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          # Inicio de sesión
│   │   └── register/page.tsx       # Registro de tenant
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       ├── page.tsx            # Inicio del dashboard
│   │       ├── components/
│   │       │   └── sidebar.tsx     # Navegación con control de permisos y módulos
│   │       ├── billing/            # Facturación
│   │       ├── hr/
│   │       │   ├── page.tsx        # Empleados
│   │       │   ├── areas/          # Áreas / departamentos
│   │       │   └── payroll/        # Nómina
│   │       ├── inventory/
│   │       │   ├── page.tsx        # Productos y stock
│   │       │   └── config/         # Categorías y unidades
│   │       ├── payments/           # Cuentas por cobrar y pagos
│   │       ├── procurement/
│   │       │   ├── page.tsx        # Órdenes de compra
│   │       │   └── suppliers/      # Proveedores
│   │       ├── sales/
│   │       │   ├── page.tsx        # Órdenes de venta
│   │       │   └── customers/      # Clientes
│   │       └── settings/
│   │           ├── alerts/         # Configuración de alertas por canal
│   │           ├── audit/          # Registro de auditoría del tenant
│   │           ├── branches/       # Sucursales
│   │           ├── modules/        # Activar/desactivar módulos del tenant
│   │           ├── profile/        # Perfil y cambio de contraseña
│   │           ├── reports/        # Reportes: ventas, stock, cuentas por cobrar
│   │           ├── roles/          # Roles y asignación de permisos
│   │           ├── tenant/         # Datos generales del tenant
│   │           └── users/          # Gestión de usuarios del tenant
│   ├── providers.tsx               # QueryClientProvider + AuthProvider
│   └── layout.tsx
│
├── lib/
│   ├── api/
│   │   ├── client.ts       # Axios: Bearer token + auto-refresh en 401
│   │   ├── auth.ts         # /auth/login, /register, /refresh, /logout
│   │   ├── sales.ts        # Órdenes de venta y clientes
│   │   ├── billing.ts      # Facturas
│   │   ├── inventory.ts    # Productos, stock, movimientos
│   │   ├── procurement.ts  # Órdenes de compra y proveedores
│   │   ├── payments.ts     # Cuentas por cobrar
│   │   ├── hr.ts           # Empleados, áreas, nómina
│   │   ├── audit.ts        # Logs de auditoría
│   │   ├── alerts.ts       # Configuración de alertas
│   │   ├── reports.ts      # Reportes agregados
│   │   ├── files.ts        # Subida y descarga de archivos
│   │   ├── roles.ts        # Roles y permisos
│   │   ├── users.ts        # Usuarios del tenant
│   │   ├── tenants.ts      # Datos y módulos del tenant
│   │   └── branches.ts     # Sucursales
│   ├── auth-context.tsx    # AuthProvider y hook useAuth
│   ├── permissions.ts      # Helper hasPermission / hasAnyPermission
│   └── token-store.ts      # Access token en memoria; refresh en localStorage
│
└── types/
    └── auth.ts             # JwtPayload, User, AuthTokens
```

## Flujo de autenticación

1. El usuario se registra (`/register`) o inicia sesión (`/login`).
2. El backend devuelve access token (15 min) + refresh token (7 días).
3. El access token se guarda en **memoria** (`token-store.ts`); el refresh token en `localStorage`.
4. Al montar la app, si hay refresh token almacenado se renueva el access token automáticamente.
5. Axios intercepta los `401` y reintenta la request con un nuevo par de tokens de forma transparente.

## Control de acceso en el sidebar

El sidebar (`components/sidebar.tsx`) evalúa cada item contra el payload del JWT:

- **`requiredPermission`** — el usuario debe tener ese permiso exacto.
- **`requiredAnyPermission`** — basta con tener al menos uno de la lista.
- Si el módulo no está activo para el tenant, el item aparece bloqueado.

Formato de permiso: `<módulo>:<acción>` — ej. `sales:create`, `billing:cancel`, `reports:read`.

## Patrones de data fetching

Todos los módulos usan TanStack Query. Lectura con `useQuery`, escritura con `useMutation` e invalidación del cache en `onSuccess`:

```tsx
const mutation = useMutation({
  mutationFn: (dto) => salesApi.createOrder(dto),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-orders'] }),
});
```

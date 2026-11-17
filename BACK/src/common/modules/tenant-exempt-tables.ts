import type { Prisma } from '@prisma/client';

// Las únicas tablas sin tenantId. Todas las demás pertenecen a una empresa y
// la seguridad de filas de Postgres las filtra por ella.
export const TENANT_EXEMPT_TABLES: Readonly<
  Partial<Record<Prisma.ModelName, string>>
> = {
  Tenant: 'es la empresa misma',
  Permission: 'catálogo global de permisos, igual para todas las empresas',
  RefreshToken: 'se busca por el token antes de saber de qué empresa es',
};

// Tablas con filas de una empresa y filas de la plataforma (tenantId vacío).
export const NULLABLE_TENANT_TABLES: Readonly<
  Partial<Record<Prisma.ModelName, string>>
> = {
  PlatformEmailMessage: 'también registra los correos propios de la plataforma',
};

'use client';

import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth-context';

interface RequirePermissionProps {
  permission?: string;
  anyOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}

// Gating de una sección dentro de una vista (un botón, una tabla, una card)
// — a diferencia del sidebar, que solo oculta/muestra ítems de menú
// completos. Sin permission/anyOf declarado, siempre renderiza los children.
export function RequirePermission({ permission, anyOf, fallback = null, children }: RequirePermissionProps) {
  const { jwtPayload } = useAuth();
  const perms = jwtPayload?.permissions ?? [];
  const allowed = permission
    ? perms.includes(permission)
    : anyOf
      ? anyOf.some((k) => perms.includes(k))
      : true;

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

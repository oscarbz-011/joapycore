'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import { tenantsApi } from './api/tenants';

/**
 * Módulos activos del tenant, en vivo.
 *
 * Se leen de la API y NO del JWT: `activeModules` en el token es una foto del
 * momento del login, así que activar o desactivar un módulo no se reflejaba
 * hasta volver a loguearse (ver ARCHITECTURE.md v0.53, donde se corrigió lo
 * mismo del lado del guard). El JWT queda solo como `initialData` para que la
 * UI se pinte completa en el primer render, sin parpadeo mientras carga.
 *
 * La query key `['tenant-modules']` es la misma que actualiza la pantalla de
 * Ajustes → Módulos al togglear, así que el cambio se propaga solo.
 */
export function useActiveModules() {
  const { jwtPayload } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-modules'],
    queryFn: tenantsApi.listModules,
    enabled: !!jwtPayload,
    staleTime: 60_000,
  });

  const activeModules = data
    ? data.filter((m) => m.active).map((m) => m.moduleName)
    : (jwtPayload?.activeModules ?? []);

  return {
    activeModules,
    hasModule: (name: string) => activeModules.includes(name),
    isLoading,
  };
}

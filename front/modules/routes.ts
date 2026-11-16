import type { RouteRule } from '@/lib/route-access';
import type { FrontModuleManifest } from './types';

/** Las rutas de un módulo exigen que el módulo esté activo. */
export function routeRulesOf(manifests: readonly FrontModuleManifest[]): RouteRule[] {
  return manifests.flatMap((m) =>
    (m.routes ?? []).map((route) =>
      m.module ? { ...route, modules: [m.module] } : { ...route },
    ),
  );
}

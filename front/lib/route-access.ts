import { FRONT_MODULES } from '@/modules/registry';
import { routeRulesOf } from '@/modules/routes';

// Qué módulo y qué permisos hacen falta para abrir cada pantalla del dashboard.
//
// El sidebar ya oculta lo que el usuario no puede usar, pero escribiendo la URL
// se entraba igual: la pantalla cargaba y cada request respondía 403 (módulo
// inactivo o permiso faltante). Estas reglas cortan antes, con un mensaje
// claro, y el menú las usa para decidir qué mostrar. El backend sigue siendo
// quien decide.

export interface RouteRule {
  prefix: string;
  /** Módulo que tiene que estar activo (cualquiera de la lista). */
  modules?: string[];
  /** Alcanza con tener uno de estos permisos. */
  anyPermission?: string[];
}

// Las declara cada módulo en su manifiesto (front/modules). Orden indistinto:
// gana el prefijo más largo que coincida.
export const ROUTE_RULES: RouteRule[] = routeRulesOf(FRONT_MODULES);

export type RouteAccess =
  | { allowed: true }
  | { allowed: false; reason: "module"; modules: string[] }
  | { allowed: false; reason: "permission" };

export function findRouteRule(
  pathname: string,
  rules: RouteRule[] = ROUTE_RULES,
): RouteRule | undefined {
  return rules
    .filter((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
}

export function checkRouteAccess(
  pathname: string,
  activeModules: string[],
  permissions: string[],
  rules: RouteRule[] = ROUTE_RULES,
): RouteAccess {
  const rule = findRouteRule(pathname, rules);
  if (!rule) return { allowed: true };
  if (rule.modules && !rule.modules.some((m) => activeModules.includes(m))) {
    return { allowed: false, reason: "module", modules: rule.modules };
  }
  if (
    rule.anyPermission &&
    !rule.anyPermission.some((p) => permissions.includes(p))
  ) {
    return { allowed: false, reason: "permission" };
  }
  return { allowed: true };
}

// Qué módulo y qué permisos hacen falta para abrir cada pantalla del dashboard.
//
// El sidebar ya oculta lo que el usuario no puede usar, pero escribiendo la URL
// se entraba igual: la pantalla cargaba y cada request respondía 403 (módulo
// inactivo o permiso faltante). Estas reglas replican las del sidebar para
// cortar antes, con un mensaje claro. El backend sigue siendo quien decide.

export interface RouteRule {
  prefix: string;
  /** Módulo que tiene que estar activo (cualquiera de la lista). */
  modules?: string[];
  /** Alcanza con tener uno de estos permisos. */
  anyPermission?: string[];
}

// Orden indistinto: gana el prefijo más largo que coincida.
export const ROUTE_RULES: RouteRule[] = [
  {
    prefix: "/dashboard/applications/email",
    anyPermission: ["applications:email:read"],
  },
  {
    prefix: "/dashboard/inventory",
    modules: ["inventory"],
    anyPermission: [
      "inventory:products:read",
      "inventory:categories:read",
      "inventory:brands:read",
      "inventory:movements:read",
    ],
  },
  {
    prefix: "/dashboard/inventory/stock-entries",
    modules: ["inventory"],
    anyPermission: ["inventory:movements:create"],
  },

  {
    prefix: "/dashboard/sales",
    modules: ["sales"],
    anyPermission: ["sales:read"],
  },
  {
    prefix: "/dashboard/sales/customers",
    modules: ["sales"],
    anyPermission: ["customers:read"],
  },
  {
    prefix: "/dashboard/sales/quotes",
    modules: ["sales"],
    anyPermission: ["sales:quotes:read", "sales:quotes:manage"],
  },

  {
    prefix: "/dashboard/procurement",
    modules: ["procurement"],
    anyPermission: ["procurement:read"],
  },
  {
    prefix: "/dashboard/procurement/suppliers",
    modules: ["procurement"],
    anyPermission: ["suppliers:read"],
  },
  {
    prefix: "/dashboard/procurement/payables",
    modules: ["procurement"],
    anyPermission: ["procurement:payables:read"],
  },

  {
    prefix: "/dashboard/production",
    modules: ["production"],
    anyPermission: ["production:orders:read", "production:recipes:read"],
  },

  {
    prefix: "/dashboard/billing",
    modules: ["billing"],
    anyPermission: ["billing:read", "billing:issue"],
  },
  {
    prefix: "/dashboard/billing/approvals",
    modules: ["finance"],
    anyPermission: ["sales:credit:evaluate"],
  },
  {
    prefix: "/dashboard/payments",
    modules: ["payments"],
    anyPermission: ["payments:read"],
  },
  {
    prefix: "/dashboard/finance",
    modules: ["finance"],
    anyPermission: ["finance:read"],
  },
  {
    prefix: "/dashboard/cobranzas",
    modules: ["collections"],
    anyPermission: ["collections:read"],
  },

  {
    prefix: "/dashboard/logistics",
    modules: ["logistics"],
    anyPermission: ["logistics:read", "logistics:manage"],
  },
  {
    prefix: "/dashboard/logistics/mine",
    modules: ["logistics"],
    anyPermission: ["logistics:track"],
  },

  {
    prefix: "/dashboard/hr",
    modules: ["hr"],
    anyPermission: ["hr:read", "hr:employees:create", "hr:leaves:manage"],
  },
  {
    prefix: "/dashboard/hr/payroll",
    modules: ["hr"],
    anyPermission: ["hr:payroll:run"],
  },
  {
    prefix: "/dashboard/hr/new",
    modules: ["hr"],
    anyPermission: ["hr:employees:create"],
  },

  { prefix: "/dashboard/pos", modules: ["pos"], anyPermission: ["pos:sell"] },
  {
    prefix: "/dashboard/pos/history",
    modules: ["pos"],
    anyPermission: ["pos:session:manage"],
  },

  {
    prefix: "/dashboard/documents",
    modules: ["documents"],
    anyPermission: ["documents:read"],
  },

  // Ajustes: /dashboard/settings (raíz) y /profile quedan libres — ahí están
  // el perfil y el cambio de contraseña de cualquier usuario.
  { prefix: "/dashboard/settings/tenant", anyPermission: ["tenants:read"] },
  { prefix: "/dashboard/settings/branches", anyPermission: ["branches:read"] },
  { prefix: "/dashboard/settings/pricing", anyPermission: ["tenants:update"] },
  { prefix: "/dashboard/settings/credit", anyPermission: ["tenants:update"] },
  {
    prefix: "/dashboard/settings/warehouses",
    anyPermission: ["warehouses:read"],
  },
  {
    prefix: "/dashboard/settings/modules",
    anyPermission: ["tenants:modules:manage"],
  },
  { prefix: "/dashboard/settings/users", anyPermission: ["users:read"] },
  { prefix: "/dashboard/settings/roles", anyPermission: ["roles:manage"] },
  { prefix: "/dashboard/settings/audit", anyPermission: ["audit:read"] },
  { prefix: "/dashboard/settings/alerts", anyPermission: ["alerts:manage"] },
  { prefix: "/dashboard/settings/reports", anyPermission: ["reports:read"] },
  {
    prefix: "/dashboard/settings/combos",
    modules: ["sales"],
    anyPermission: ["sales:combos:read"],
  },
  {
    prefix: "/dashboard/settings/pos-terminals",
    modules: ["pos"],
    anyPermission: ["pos:terminals:manage"],
  },
];

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

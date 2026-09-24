"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  AppWindow,
  Package,
  ShoppingCart,
  Truck,
  Landmark,
  Hammer,
  Route,
  Users,
  Network,
  FolderKanban,
  Monitor,
  Boxes,
  FolderOpen,
  Headphones,
  Crown,
  Building2,
  Settings,
  ChevronDown,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "../../../../lib/auth-context";
import { alertsApi } from "../../../../lib/api/alerts";
import { useActiveModules } from "../../../../lib/use-active-modules";
import { usePendingNotifications } from "../../../../lib/use-pending-notifications";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubItem {
  label: string;
  href: string;
  permission?: string;
  module?: string;
  stub?: boolean;
  badge?: number;
}

interface SidebarGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: SubItem[];
  modules?: string[];
  anyPermission?: string[];
  // Sin dropdown — link directo al único item. Para secciones que ya
  // administran todo puertas adentro con sus propias pestañas (ver
  // documents-nav.tsx), donde desplegar un submenú de una sola opción es
  // un clic extra sin aportar nada.
  flat?: boolean;
}

// ── Group definitions ─────────────────────────────────────────────────────────

const STATIC_GROUPS: SidebarGroup[] = [
  {
    id: "apps",
    label: "Aplicaciones",
    icon: AppWindow,
    anyPermission: ["communications:access"],
    items: [
      {
        label: "Centro de comunicaciones",
        href: "/dashboard/applications/communications",
        permission: "communications:access",
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventario",
    icon: Package,
    modules: ["inventory"],
    anyPermission: [
      "inventory:products:read",
      "inventory:categories:read",
      "inventory:brands:read",
      "inventory:movements:read",
    ],
    items: [
      { label: "Productos", href: "/dashboard/inventory/products" },
      { label: "Categorías", href: "/dashboard/inventory/categories" },
      { label: "Marcas", href: "/dashboard/inventory/brands" },
      { label: "Movimientos", href: "/dashboard/inventory/movements" },
      {
        label: "Lotes",
        href: "/dashboard/inventory/batches",
        permission: "inventory:products:read",
      },
      {
        label: "Carga inicial",
        href: "/dashboard/inventory/stock-entries/initial",
        permission: "inventory:movements:create",
      },
      { label: "Stock", href: "/dashboard/inventory/stock", stub: true },
    ],
  },
  {
    id: "sales",
    label: "Ventas",
    icon: ShoppingCart,
    modules: ["sales"],
    anyPermission: ["sales:read", "customers:read", "sales:quotes:read"],
    items: [
      {
        label: "Clientes",
        href: "/dashboard/sales/customers",
        permission: "customers:read",
      },
      {
        label: "Órdenes de venta",
        href: "/dashboard/sales",
        permission: "sales:read",
      },
      {
        label: "Presupuestos",
        href: "/dashboard/sales/quotes",
        permission: "sales:quotes:read",
      },
      {
        label: "Metas",
        href: "/dashboard/sales/targets",
        permission: "sales:read",
      },
      { label: "Devoluciones", href: "/dashboard/sales", stub: true },
    ],
  },
  {
    id: "procurement",
    label: "Compras",
    icon: Truck,
    modules: ["procurement"],
    anyPermission: ["procurement:read", "suppliers:read"],
    items: [
      {
        label: "Órdenes de compra",
        href: "/dashboard/procurement",
        permission: "procurement:read",
      },
      {
        label: "Comparar precios",
        href: "/dashboard/procurement/compare-prices",
        permission: "procurement:read",
      },
      {
        label: "Proveedores",
        href: "/dashboard/procurement/suppliers",
        permission: "suppliers:read",
      },
      {
        label: "Devolución de compra",
        href: "/dashboard/procurement",
        stub: true,
      },
    ],
  },
  {
    // Solo aparece para tenants con el módulo activo — rubros que fabrican lo
    // que venden (carpintería, taller). Ver ProductKind.
    id: "production",
    label: "Producción",
    icon: Hammer,
    modules: ["production"],
    anyPermission: ["production:orders:read", "production:recipes:read"],
    items: [
      {
        label: "Órdenes de producción",
        href: "/dashboard/production",
        permission: "production:orders:read",
      },
    ],
  },
  {
    id: "finanzas",
    label: "Finanzas",
    icon: Landmark,
    modules: ["billing", "payments", "finance", "collections", "procurement"],
    anyPermission: [
      "billing:read",
      "billing:issue",
      "payments:read",
      "finance:read",
      "collections:read",
      "sales:credit:evaluate",
      "procurement:payables:read",
    ],
    items: [
      {
        label: "Facturas",
        href: "/dashboard/billing",
        permission: "billing:read",
        module: "billing",
      },
      {
        label: "Cuentas por cobrar",
        href: "/dashboard/payments",
        permission: "payments:read",
        module: "payments",
      },
      {
        label: "Cuentas por pagar",
        href: "/dashboard/procurement/payables",
        permission: "procurement:payables:read",
        module: "procurement",
      },
      {
        label: "Evaluación de crédito",
        href: "/dashboard/billing/approvals",
        permission: "sales:credit:evaluate",
        module: "finance",
      },
      {
        label: "Financiamiento",
        href: "/dashboard/finance",
        permission: "finance:read",
        module: "finance",
      },
      {
        label: "Cobranzas",
        href: "/dashboard/cobranzas",
        permission: "collections:read",
        module: "collections",
      },
      { label: "Contabilidad", href: "#", stub: true },
      { label: "Tesorería", href: "#", stub: true },
      { label: "Presupuesto", href: "#", stub: true },
      { label: "Gastos", href: "#", stub: true },
      { label: "Impuestos", href: "#", stub: true },
      {
        label: "Reportes",
        href: "/dashboard/settings/reports",
        permission: "reports:read",
      },
    ],
  },
  {
    id: "logistics",
    label: "Logística",
    icon: Route,
    modules: ["logistics"],
    anyPermission: [
      "logistics:read",
      "logistics:manage",
      "logistics:track",
      "warehouses:read",
    ],
    items: [
      {
        label: "Entregas",
        href: "/dashboard/logistics/deliveries",
        permission: "logistics:read",
      },
      {
        label: "Mis entregas",
        href: "/dashboard/logistics/mine",
        permission: "logistics:track",
      },
      { label: "Entrada", href: "/dashboard/inventory", stub: true },
      { label: "Salida", href: "/dashboard/inventory", stub: true },
      { label: "Almacenamiento", href: "/dashboard/inventory", stub: true },
      { label: "Transporte", href: "/dashboard/inventory", stub: true },
      {
        label: "Depósitos",
        href: "/dashboard/settings/warehouses",
        permission: "warehouses:read",
      },
    ],
  },
  {
    id: "hr",
    label: "RRHH",
    icon: Users,
    modules: ["hr"],
    anyPermission: [
      "hr:read",
      "hr:employees:create",
      "hr:payroll:run",
      "hr:leaves:manage",
    ],
    items: [
      { label: "Empleados", href: "/dashboard/hr", permission: "hr:read" },
      { label: "Departamentos", href: "/dashboard/hr/areas" },
      { label: "Roles", href: "/dashboard/hr", stub: true },
      { label: "Asistencia", href: "/dashboard/hr", stub: true },
      {
        label: "Vacaciones",
        href: "/dashboard/hr/leaves",
        permission: "hr:read",
      },
      {
        label: "Nómina de sueldos",
        href: "/dashboard/hr/payroll",
        permission: "hr:payroll:run",
      },
      { label: "Reclutamiento", href: "/dashboard/hr", stub: true },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    icon: Network,
    modules: ["crm"],
    items: [
      { label: "Contactos", href: "#", stub: true },
      { label: "Leads", href: "#", stub: true },
      { label: "Deals", href: "#", stub: true },
      { label: "Pipeline", href: "#", stub: true },
      { label: "Campañas", href: "#", stub: true },
      { label: "Comentarios de clientes", href: "#", stub: true },
    ],
  },
  {
    id: "projects",
    label: "Proyectos",
    icon: FolderKanban,
    modules: ["projects"],
    items: [
      { label: "Proyectos", href: "#", stub: true },
      { label: "Tareas", href: "#", stub: true },
      { label: "Timesheet", href: "#", stub: true },
      { label: "Asignación de recursos", href: "#", stub: true },
      { label: "Hitos", href: "#", stub: true },
    ],
  },
  {
    id: "pos",
    label: "POS",
    icon: Monitor,
    modules: ["pos"],
    anyPermission: ["pos:sell", "pos:session:manage"],
    items: [
      { label: "POS", href: "/dashboard/pos", permission: "pos:sell" },
      {
        label: "Órdenes POS",
        href: "/dashboard/pos/history",
        permission: "pos:session:manage",
      },
      {
        label: "Impresión de códigos de barra",
        href: "/dashboard/pos",
        stub: true,
      },
      { label: "Impresión de códigos QR", href: "/dashboard/pos", stub: true },
      {
        label: "Configuración de impresión",
        href: "/dashboard/pos",
        stub: true,
      },
    ],
  },
  {
    id: "assets",
    label: "Activos Fijos",
    icon: Boxes,
    modules: ["assets"],
    items: [
      { label: "Registro de activos", href: "#", stub: true },
      { label: "Asignaciones", href: "#", stub: true },
      { label: "Mantenimiento", href: "#", stub: true },
      { label: "Desecho", href: "#", stub: true },
    ],
  },
  {
    id: "documents",
    label: "Documentos",
    icon: FolderOpen,
    modules: ["documents"],
    flat: true,
    items: [
      {
        label: "Documentos",
        href: "/dashboard/documents",
        permission: "documents:read",
      },
    ],
  },
  {
    id: "empresa",
    label: "Empresa",
    icon: Building2,
    anyPermission: [
      "tenants:read",
      "tenants:update",
      "branches:read",
      "warehouses:read",
    ],
    items: [
      {
        label: "Mi empresa",
        href: "/dashboard/settings/tenant",
        permission: "tenants:read",
      },
      {
        label: "Sucursales",
        href: "/dashboard/settings/branches",
        permission: "branches:read",
      },
      {
        label: "Precios",
        href: "/dashboard/settings/pricing",
        permission: "tenants:update",
      },
      {
        label: "Depósitos",
        href: "/dashboard/settings/warehouses",
        permission: "warehouses:read",
      },
    ],
    // Crédito y Cajas (POS) se accedan desde la tuerca de sus tarjetas en
    // Ajustes → Módulos (Financiamiento / Punto de Venta), no desde acá —
    // evita duplicar rutas de configuración propias de un módulo en este grupo genérico.
  },
  {
    id: "membership",
    label: "Membresía",
    icon: Crown,
    items: [
      { label: "Planes", href: "#", stub: true },
      { label: "Addons", href: "#", stub: true },
      { label: "Transacciones", href: "#", stub: true },
    ],
  },
  {
    id: "support",
    label: "Soporte",
    icon: Headphones,
    items: [
      { label: "Contacto de mensajes", href: "#", stub: true },
      { label: "Tickets", href: "#", stub: true },
      { label: "Base de conocimiento", href: "#", stub: true },
      { label: "Gestión de SLA", href: "#", stub: true },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    icon: Settings,
    anyPermission: [
      "tenants:modules:manage",
      "users:read",
      "roles:manage",
      "audit:read",
      "alerts:manage",
      "integrations:read",
    ],
    items: [
      {
        label: "Módulos",
        href: "/dashboard/settings/modules",
        permission: "tenants:modules:manage",
      },
      {
        label: "Gestión de usuarios",
        href: "/dashboard/settings/users",
        permission: "users:read",
      },
      {
        label: "Roles y permisos",
        href: "/dashboard/settings/roles",
        permission: "roles:manage",
      },
      {
        label: "Auditoría",
        href: "/dashboard/settings/audit",
        permission: "audit:read",
      },
      {
        label: "Alertas",
        href: "/dashboard/settings/alerts",
        permission: "alerts:manage",
      },
      {
        label: "Integraciones",
        href: "/dashboard/settings?tab=integrations",
        permission: "integrations:read",
      },
      {
        label: "Configuración",
        href: "/dashboard/settings",
        permission: "tenants:update",
      },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGroupVisible(
  group: SidebarGroup,
  activeModules: string[],
  permissions: string[],
) {
  if (group.modules && !group.modules.some((m) => activeModules.includes(m)))
    return false;
  if (group.anyPermission)
    return group.anyPermission.some((p) => permissions.includes(p));
  return true;
}

// ── ModuleGroup ────────────────────────────────────────────────────────────────

function ModuleGroup({
  group,
  permissions,
  activeModules,
}: {
  group: SidebarGroup;
  permissions: string[];
  activeModules: string[];
}) {
  const pathname = usePathname();

  const visibleItems = group.items.filter(
    (item) =>
      (!item.permission || permissions.includes(item.permission)) &&
      (!item.module || activeModules.includes(item.module)),
  );

  const hasActive = visibleItems.some(
    (item) => !item.stub && item.href !== "#" && pathname === item.href,
  );

  const [open, setOpen] = useState(hasActive);
  const Icon = group.icon;

  if (visibleItems.length === 0) return null;

  if (group.flat) {
    const item = visibleItems[0];
    const isActive = !item.stub && item.href !== "#" && pathname === item.href;
    return (
      <Link
        href={item.href}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[9px] px-3 py-[7px] text-[13.5px] font-medium no-underline transition-colors",
          isActive
            ? "bg-sidebar-primary/15 text-sidebar-primary"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon size={15} className="shrink-0 opacity-75" />
        <span className="flex-1 text-left">{group.label}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[9px] border-0 px-3 py-[7px] text-[13.5px] font-medium",
          "cursor-pointer bg-transparent transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          hasActive ? "text-sidebar-foreground" : "text-sidebar-foreground/60",
        )}
      >
        <Icon size={15} className="shrink-0 opacity-75" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          size={12}
          className={cn(
            "shrink-0 text-sidebar-foreground/30 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-px flex flex-col gap-px pl-2.5">
          {visibleItems.map((item) => {
            const isActive =
              !item.stub && item.href !== "#" && pathname === item.href;

            if (item.stub) {
              return (
                <div
                  key={item.label}
                  className="flex cursor-default select-none items-center gap-2.5 rounded-[7px] px-3 py-[5.5px] text-[13px] text-sidebar-foreground/30"
                >
                  <span className="size-1 shrink-0 rounded-full bg-sidebar-foreground/20" />
                  {item.label}
                </div>
              );
            }

            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[7px] px-3 py-[5.5px] text-[13px] no-underline transition-colors",
                  isActive
                    ? "bg-sidebar-primary/15 font-semibold text-sidebar-primary"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1 shrink-0 rounded-full transition-colors",
                    isActive
                      ? "bg-sidebar-primary"
                      : "bg-sidebar-foreground/20",
                  )}
                />
                <span className="flex-1">{item.label}</span>
                {!!item.badge && (
                  <span className="rounded-full bg-red-500/20 px-1.5 py-px text-[11px] font-bold leading-none text-red-400">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { jwtPayload } = useAuth();

  const permissions = jwtPayload?.permissions ?? [];
  const tenantName = jwtPayload?.tenantName ?? "";

  // En vivo, no del JWT — ver useActiveModules.
  const { activeModules } = useActiveModules();

  const { data: alertConfigs = [] } = useQuery({
    queryKey: ["alert-configs"],
    queryFn: alertsApi.getConfigs,
    enabled:
      permissions.includes("alerts:read") ||
      permissions.includes("alerts:manage"),
  });
  const alertBadge = alertConfigs.filter((c) => c.isActive).length || undefined;

  const { counts: pendingCounts } = usePendingNotifications(
    permissions,
    activeModules,
    jwtPayload?.sub,
  );

  const badgeByHref: Record<string, number | undefined> = {
    "/dashboard/settings/alerts": alertBadge,
    "/dashboard/billing": pendingCounts.invoices,
    "/dashboard/billing/approvals": pendingCounts.approvals,
    "/dashboard/payments": pendingCounts.overdueAR,
    "/dashboard/sales": pendingCounts.myAdjustments,
    "/dashboard/procurement": pendingCounts.overduePOs,
    "/dashboard/logistics/deliveries": pendingCounts.pendingDeliveries,
  };

  const brandInitial = (tenantName?.[0] ?? "J").toUpperCase();
  const isDashActive = pathname === "/dashboard";

  const groups = STATIC_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((item) =>
      item.href in badgeByHref
        ? { ...item, badge: badgeByHref[item.href] }
        : item,
    ),
  }));

  const BOTTOM_IDS = new Set(["empresa", "membership", "support", "sistema"]);
  const allVisible = groups.filter((g) =>
    isGroupVisible(g, activeModules, permissions),
  );
  const mainGroups = allVisible.filter((g) => !BOTTOM_IDS.has(g.id));
  const bottomGroups = allVisible.filter((g) => BOTTOM_IDS.has(g.id));

  return (
    <aside className="fixed inset-y-0 left-0 flex w-[250px] flex-col border-r ">
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-3 px-[18px] pb-4 pt-[18px]">
        <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-emerald-500 to-emerald-700 text-[18px] font-extrabold text-white shadow-[0_4px_12px_rgba(16,185,129,0.35)]">
          {brandInitial}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-[15px] font-bold text-sidebar-foreground">
            JoapyCore
          </div>
          {tenantName && (
            <div className="truncate text-[12px] text-sidebar-foreground/50">
              {tenantName}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5">
        <Link
          href="/dashboard"
          className={cn(
            "mb-1 flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[13.5px] font-medium no-underline transition-colors",
            isDashActive
              ? "bg-sidebar-primary/15 font-semibold text-sidebar-primary"
              : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <LayoutDashboard size={15} className="shrink-0 opacity-75" />
          <span>Dashboard</span>
        </Link>

        <div className="flex flex-col gap-px">
          {mainGroups.map((group) => (
            <ModuleGroup
              key={group.id}
              group={group}
              permissions={permissions}
              activeModules={activeModules}
            />
          ))}
        </div>
      </nav>

      {/* Bottom groups */}
      {bottomGroups.length > 0 && (
        <div className="flex shrink-0 flex-col gap-px border-t border-sidebar-border px-3 py-2">
          {bottomGroups.map((group) => (
            <ModuleGroup
              key={group.id}
              group={group}
              permissions={permissions}
              activeModules={activeModules}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

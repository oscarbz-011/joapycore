'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart,
  Package,
  FileText,
  CreditCard,
  Truck,
  Users,
  Banknote,
  ClipboardList,
  Monitor,
  Lock,
  AlertCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { tenantsApi, type TenantModuleResponse } from '../../../../../lib/api/tenants';
import { useAuth } from '../../../../../lib/auth-context';

// ── Catalog (mirrors back-end MODULE_CATALOG) ──────────────────────────────────

interface CatalogEntry {
  displayName: string;
  description: string;
  icon: LucideIcon;
  dependencies: string[];
  isStable: boolean;
}

const CATALOG: Record<string, CatalogEntry> = {
  inventory:   { displayName: 'Inventario',        icon: Package,       description: 'Gestión de productos, stock y movimientos de almacén',    dependencies: [],                              isStable: true  },
  sales:       { displayName: 'Ventas',             icon: ShoppingCart,  description: 'Pedidos, presupuestos y gestión de clientes',             dependencies: ['inventory'],                   isStable: true  },
  billing:     { displayName: 'Facturación',        icon: FileText,      description: 'Emisión y administración de facturas',                    dependencies: ['sales'],                       isStable: true  },
  payments:    { displayName: 'Pagos',              icon: CreditCard,    description: 'Cuentas por cobrar y registros de pago',                  dependencies: ['billing'],                     isStable: true  },
  procurement: { displayName: 'Compras',            icon: Truck,         description: 'Órdenes de compra y gestión de proveedores',              dependencies: ['inventory'],                   isStable: true  },
  hr:          { displayName: 'Recursos Humanos',   icon: Users,         description: 'Empleados, licencias y procesamiento de nómina',          dependencies: [],                              isStable: true  },
  finance:     { displayName: 'Finanzas',           icon: Banknote,      description: 'Créditos, planes de cuotas e installments',               dependencies: ['sales', 'billing'],            isStable: false },
  collections: { displayName: 'Cobranzas',          icon: ClipboardList, description: 'Asignación de cobradores y gestión de mora',              dependencies: ['finance'],                     isStable: false },
  pos:         { displayName: 'Punto de Venta',     icon: Monitor,       description: 'Venta rápida con código de barras y caja',                dependencies: ['sales', 'inventory', 'billing'], isStable: false },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function depLabel(key: string) {
  return CATALOG[key]?.displayName ?? key;
}

// ── Module card ────────────────────────────────────────────────────────────────

function ModuleCard({
  mod,
  activeMap,
  canToggle,
  isPending,
  onToggle,
}: {
  mod: TenantModuleResponse;
  activeMap: Map<string, boolean>;
  canToggle: boolean;
  isPending: boolean;
  onToggle: () => void;
}) {
  const meta = CATALOG[mod.moduleName];
  if (!meta) return null;

  const Icon = meta.icon;

  // Deps check
  const inactiveDeps = meta.dependencies.filter((d) => !activeMap.get(d));
  const blockingDeps = !mod.active ? inactiveDeps : [];

  // When active, check if deactivating would break something
  const wouldBreakModules = mod.active
    ? Object.entries(CATALOG)
        .filter(([key, def]) => key !== mod.moduleName && activeMap.get(key) && def.dependencies.includes(mod.moduleName))
        .map(([, def]) => def.displayName)
    : [];

  const isLocked = !mod.active && blockingDeps.length > 0;
  const canActivate = !isLocked;

  return (
    <div className={`flex items-start gap-4 rounded-xl border bg-surface px-5 py-4 transition-colors ${
      mod.active ? 'border-border' : 'border-border'
    }`}>
      {/* Icon */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
        mod.active ? 'bg-accent/10' : 'bg-surface-2'
      }`}>
        <Icon size={18} className={mod.active ? 'text-accent' : 'text-faint'} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-ink">{meta.displayName}</p>
          {!meta.isStable && (
            <span className="rounded-full bg-warn-subtle px-2 py-0.5 text-xs font-medium text-warn">
              Próximamente
            </span>
          )}
          {mod.active && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Activo
            </span>
          )}
        </div>
        <p className="text-xs text-muted mt-0.5">{meta.description}</p>

        {/* Dependency info */}
        {meta.dependencies.length > 0 && (
          <p className="text-xs text-faint mt-1">
            Requiere: {meta.dependencies.map(depLabel).join(', ')}
          </p>
        )}

        {/* Blocked reason */}
        {isLocked && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-warn">
            <Lock size={11} />
            <span>Activá primero: {blockingDeps.map(depLabel).join(', ')}</span>
          </div>
        )}

        {/* Would break warning */}
        {mod.active && wouldBreakModules.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-faint">
            <AlertCircle size={11} />
            <span>Dependen de este módulo: {wouldBreakModules.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Toggle */}
      {canToggle && meta.isStable && (
        <button
          onClick={onToggle}
          disabled={isPending || (isLocked && !mod.active) || (!canActivate && !mod.active)}
          title={isLocked ? `Activá primero: ${blockingDeps.map(depLabel).join(', ')}` : undefined}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
            mod.active ? 'bg-ink' : 'bg-border-strong'
          }`}
          role="switch"
          aria-checked={mod.active}
          aria-label={`${mod.active ? 'Desactivar' : 'Activar'} ${meta.displayName}`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-surface shadow transform transition-transform duration-200 ${
              mod.active ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      )}

      {/* Coming soon placeholder */}
      {!meta.isStable && (
        <span className="shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs text-faint">
          Beta
        </span>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ModulesPage() {
  const queryClient = useQueryClient();
  const { jwtPayload, refreshSession } = useAuth();
  const canToggle = jwtPayload?.permissions.includes('tenants:modules:manage') ?? false;

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['tenant-modules'],
    queryFn: tenantsApi.listModules,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ moduleName, active }: { moduleName: string; active: boolean }) =>
      tenantsApi.toggleModule(moduleName, active),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['tenant-modules'], updated);
      await refreshSession();
    },
  });

  const activeMap = new Map(modules.map((m) => [m.moduleName, m.active]));

  // Sort: stable first, then by name
  const sorted = [...modules].sort((a, b) => {
    const aStable = CATALOG[a.moduleName]?.isStable ?? false;
    const bStable = CATALOG[b.moduleName]?.isStable ?? false;
    if (aStable !== bStable) return aStable ? -1 : 1;
    return (CATALOG[a.moduleName]?.displayName ?? a.moduleName).localeCompare(
      CATALOG[b.moduleName]?.displayName ?? b.moduleName,
    );
  });

  const stableModules   = sorted.filter((m) => CATALOG[m.moduleName]?.isStable !== false);
  const betaModules     = sorted.filter((m) => CATALOG[m.moduleName]?.isStable === false);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Módulos</h1>
        <p className="mt-1 text-sm text-muted">
          Activá o desactivá los módulos disponibles para tu empresa. Los módulos en beta estarán disponibles próximamente.
        </p>
      </div>

      {/* Error toast */}
      {toggleMutation.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {(toggleMutation.error as Error & { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Error al cambiar el módulo'}
        </div>
      )}

      {/* Stable modules */}
      {stableModules.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Módulos disponibles</h2>
          <div className="space-y-2">
            {stableModules.map((mod) => (
              <ModuleCard
                key={mod.id}
                mod={mod}
                activeMap={activeMap}
                canToggle={canToggle}
                isPending={
                  toggleMutation.isPending &&
                  (toggleMutation.variables as { moduleName: string } | undefined)?.moduleName === mod.moduleName
                }
                onToggle={() => toggleMutation.mutate({ moduleName: mod.moduleName, active: !mod.active })}
              />
            ))}
          </div>
        </section>
      )}

      {/* Beta modules */}
      {betaModules.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Próximamente</h2>
          <div className="space-y-2">
            {betaModules.map((mod) => (
              <ModuleCard
                key={mod.id}
                mod={mod}
                activeMap={activeMap}
                canToggle={canToggle}
                isPending={false}
                onToggle={() => {}}
              />
            ))}
          </div>
        </section>
      )}

      {!canToggle && (
        <p className="text-xs text-faint text-center">
          Necesitás el permiso <span className="font-mono">tenants:modules:manage</span> para modificar los módulos.
        </p>
      )}
    </div>
  );
}

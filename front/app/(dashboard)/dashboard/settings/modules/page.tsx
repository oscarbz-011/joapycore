'use client';

import { useState } from 'react';
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
  Route,
  Network,
  FolderKanban,
  Boxes,
  FolderOpen,
  Lock,
  AlertCircle,
  LayoutGrid,
  List,
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
  inventory:   { displayName: 'Inventario',        icon: Package,       description: 'Gestión de productos, stock y movimientos de almacén',              dependencies: [],                                isStable: true  },
  sales:       { displayName: 'Ventas',             icon: ShoppingCart,  description: 'Pedidos, presupuestos y gestión de clientes',                       dependencies: ['inventory'],                     isStable: true  },
  billing:     { displayName: 'Facturación',        icon: FileText,      description: 'Emisión y administración de facturas',                              dependencies: ['sales'],                         isStable: true  },
  payments:    { displayName: 'Pagos',              icon: CreditCard,    description: 'Cuentas por cobrar y registros de pago',                            dependencies: ['billing'],                       isStable: true  },
  procurement: { displayName: 'Compras',            icon: Truck,         description: 'Órdenes de compra y gestión de proveedores',                        dependencies: ['inventory'],                     isStable: true  },
  hr:          { displayName: 'Recursos Humanos',   icon: Users,         description: 'Empleados, licencias y procesamiento de nómina',                    dependencies: [],                                isStable: true  },
  finance:     { displayName: 'Financiamiento',       icon: Banknote,      description: 'Créditos, planes de cuotas e installments',                         dependencies: ['sales', 'billing'],              isStable: true  },
  collections: { displayName: 'Cobranzas',          icon: ClipboardList, description: 'Asignación de cobradores y gestión de mora',                       dependencies: ['finance'],                       isStable: true  },
  pos:         { displayName: 'Punto de Venta',     icon: Monitor,       description: 'Venta rápida con código de barras y caja',                          dependencies: ['sales', 'inventory', 'billing'], isStable: false },
  logistics:   { displayName: 'Logística',          icon: Route,         description: 'Entrada, salida, almacenamiento y transporte de mercancías',         dependencies: ['inventory'],                     isStable: false },
  crm:         { displayName: 'CRM',                icon: Network,       description: 'Gestión de contactos, leads, deals y campañas comerciales',         dependencies: ['sales'],                         isStable: false },
  projects:    { displayName: 'Proyectos',          icon: FolderKanban,  description: 'Gestión de proyectos, tareas, timesheet y recursos',                dependencies: [],                                isStable: false },
  assets:      { displayName: 'Activos Fijos',      icon: Boxes,         description: 'Registro, asignación y mantenimiento de activos empresariales',     dependencies: [],                                isStable: false },
  documents:   { displayName: 'Documentos',         icon: FolderOpen,    description: 'Repositorio de documentos, políticas y contratos',                  dependencies: [],                                isStable: false },
};

function depLabel(key: string) {
  return CATALOG[key]?.displayName ?? key;
}

// ── Toggle switch ──────────────────────────────────────────────────────────────

function Toggle({
  checked,
  disabled,
  title,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  title?: string;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      title={title}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-primary' : 'bg-muted/50'
      }`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transform transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Grid card ──────────────────────────────────────────────────────────────────

function GridCard({
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
  const inactiveDeps = meta.dependencies.filter((d) => !activeMap.get(d));
  const isLocked = !mod.active && inactiveDeps.length > 0;
  const wouldBreak = mod.active
    ? Object.entries(CATALOG)
        .filter(([key, def]) => key !== mod.moduleName && activeMap.get(key) && def.dependencies.includes(mod.moduleName))
        .map(([, def]) => def.displayName)
    : [];

  return (
    <div className={`flex flex-col rounded-[14px] border bg-card p-5 transition-colors ${
      mod.active ? 'border-primary/30' : 'border-border'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] ${
          mod.active ? 'bg-primary/10' : 'bg-muted/30'
        }`}>
          <Icon size={20} className={mod.active ? 'text-primary' : 'text-muted-foreground/60'} />
        </div>
        {canToggle && (
          <Toggle
            checked={mod.active}
            disabled={isPending || isLocked}
            title={isLocked ? `Activá primero: ${inactiveDeps.map(depLabel).join(', ')}` : undefined}
            label={`${mod.active ? 'Desactivar' : 'Activar'} ${meta.displayName}`}
            onChange={onToggle}
          />
        )}
      </div>

      {/* Name + badges */}
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <p className="text-[13.5px] font-semibold text-foreground">{meta.displayName}</p>
        {!meta.isStable && (
          <span className="rounded-full bg-warn-subtle px-2 py-0.5 text-[11px] font-medium text-warn">Beta</span>
        )}
        {mod.active && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Activo</span>
        )}
      </div>

      {/* Description */}
      <p className="text-[12.5px] text-muted-foreground leading-relaxed flex-1">{meta.description}</p>

      {/* Footer info */}
      <div className="mt-3 space-y-1">
        {meta.dependencies.length > 0 && (
          <p className="text-[11.5px] text-muted-foreground/60">
            Requiere: {meta.dependencies.map(depLabel).join(', ')}
          </p>
        )}
        {isLocked && (
          <div className="flex items-center gap-1 text-[11.5px] text-warn">
            <Lock size={10} />
            <span>Activá primero: {inactiveDeps.map(depLabel).join(', ')}</span>
          </div>
        )}
        {mod.active && wouldBreak.length > 0 && (
          <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground/60">
            <AlertCircle size={10} />
            <span>Dependen de este: {wouldBreak.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── List row ───────────────────────────────────────────────────────────────────

function ListRow({
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
  const inactiveDeps = meta.dependencies.filter((d) => !activeMap.get(d));
  const isLocked = !mod.active && inactiveDeps.length > 0;
  const wouldBreak = mod.active
    ? Object.entries(CATALOG)
        .filter(([key, def]) => key !== mod.moduleName && activeMap.get(key) && def.dependencies.includes(mod.moduleName))
        .map(([, def]) => def.displayName)
    : [];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
      {/* Icon */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
        mod.active ? 'bg-primary/10' : 'bg-muted/30'
      }`}>
        <Icon size={18} className={mod.active ? 'text-primary' : 'text-muted-foreground/60'} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] font-semibold text-foreground">{meta.displayName}</p>
          {!meta.isStable && (
            <span className="rounded-full bg-warn-subtle px-2 py-0.5 text-[11px] font-medium text-warn">Beta</span>
          )}
          {mod.active && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Activo</span>
          )}
        </div>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">{meta.description}</p>

        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
          {meta.dependencies.length > 0 && (
            <p className="text-[11.5px] text-muted-foreground/60">Requiere: {meta.dependencies.map(depLabel).join(', ')}</p>
          )}
          {isLocked && (
            <div className="flex items-center gap-1 text-[11.5px] text-warn">
              <Lock size={10} />
              <span>Activá primero: {inactiveDeps.map(depLabel).join(', ')}</span>
            </div>
          )}
          {mod.active && wouldBreak.length > 0 && (
            <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground/60">
              <AlertCircle size={10} />
              <span>Dependen de este: {wouldBreak.join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Toggle */}
      {canToggle && (
        <Toggle
          checked={mod.active}
          disabled={isPending || isLocked}
          title={isLocked ? `Activá primero: ${inactiveDeps.map(depLabel).join(', ')}` : undefined}
          label={`${mod.active ? 'Desactivar' : 'Activar'} ${meta.displayName}`}
          onChange={onToggle}
        />
      )}
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────

function Section({
  title,
  modules,
  view,
  activeMap,
  canToggle,
  pendingName,
  onToggle,
}: {
  title: string;
  modules: TenantModuleResponse[];
  view: 'grid' | 'list';
  activeMap: Map<string, boolean>;
  canToggle: boolean;
  pendingName: string | undefined;
  onToggle: (moduleName: string, active: boolean) => void;
}) {
  if (modules.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">{title}</h2>
      {view === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {modules.map((mod) => (
            <GridCard
              key={mod.id}
              mod={mod}
              activeMap={activeMap}
              canToggle={canToggle}
              isPending={pendingName === mod.moduleName}
              onToggle={() => onToggle(mod.moduleName, !mod.active)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {modules.map((mod) => (
            <ListRow
              key={mod.id}
              mod={mod}
              activeMap={activeMap}
              canToggle={canToggle}
              isPending={pendingName === mod.moduleName}
              onToggle={() => onToggle(mod.moduleName, !mod.active)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ModulesPage() {
  const queryClient = useQueryClient();
  const { jwtPayload, refreshSession } = useAuth();
  const canToggle = jwtPayload?.permissions.includes('tenants:modules:manage') ?? false;
  const [view, setView] = useState<'grid' | 'list'>('grid');

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

  const pendingName = (toggleMutation.variables as { moduleName: string } | undefined)?.moduleName;
  const activeMap = new Map(modules.map((m) => [m.moduleName, m.active]));

  const sorted = [...modules].sort((a, b) => {
    const aStable = CATALOG[a.moduleName]?.isStable ?? false;
    const bStable = CATALOG[b.moduleName]?.isStable ?? false;
    if (aStable !== bStable) return aStable ? -1 : 1;
    return (CATALOG[a.moduleName]?.displayName ?? a.moduleName).localeCompare(
      CATALOG[b.moduleName]?.displayName ?? b.moduleName,
    );
  });

  const stableModules = sorted.filter((m) => CATALOG[m.moduleName]?.isStable !== false);
  const betaModules   = sorted.filter((m) => CATALOG[m.moduleName]?.isStable === false);

  function handleToggle(moduleName: string, active: boolean) {
    toggleMutation.mutate({ moduleName, active });
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-[14px] bg-muted/30" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Módulos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Activá o desactivá los módulos de tu empresa. Los módulos en Beta pueden tener funcionalidades en desarrollo.
          </p>
        </div>

        {/* View toggle */}
        <div className="flex shrink-0 items-center gap-1 rounded-[10px] border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setView('grid')}
            title="Vista grilla"
            className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              view === 'grid'
                ? 'bg-muted/20 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid size={13} />
            <span>Grilla</span>
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            title="Vista lista"
            className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              view === 'list'
                ? 'bg-muted/20 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <List size={13} />
            <span>Lista</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {toggleMutation.isError && (
        <div className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {(toggleMutation.error as Error & { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Error al cambiar el módulo'}
        </div>
      )}

      <Section
        title="Módulos disponibles"
        modules={stableModules}
        view={view}
        activeMap={activeMap}
        canToggle={canToggle}
        pendingName={toggleMutation.isPending ? pendingName : undefined}
        onToggle={handleToggle}
      />

      <Section
        title="Beta"
        modules={betaModules}
        view={view}
        activeMap={activeMap}
        canToggle={canToggle}
        pendingName={toggleMutation.isPending ? pendingName : undefined}
        onToggle={handleToggle}
      />

      {!canToggle && (
        <p className="text-xs text-muted-foreground/60 text-center">
          Necesitás el permiso <span className="font-mono">tenants:modules:manage</span> para modificar los módulos.
        </p>
      )}
    </div>
  );
}

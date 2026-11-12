'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Lock,
  LayoutGrid,
  List,
  Info,
  Settings as SettingsIcon,
  Search,
  X,
} from 'lucide-react';
import {
  tenantsApi,
  type RoadmapModule,
  type TenantModuleResponse,
} from '../../../../../lib/api/tenants';
import { useAuth } from '../../../../../lib/auth-context';
import {
  catalogByKey,
  catalogSections,
  type CatalogModule,
  type ModuleStatusFilter,
} from '@/lib/module-catalog';
import { Button } from '@/components/ui/button';
import { ModuleIcon } from '@/components/modules/module-icon';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type Catalog = Record<string, CatalogModule>;

function labelOf(catalog: Catalog, key: string) {
  return catalog[key]?.displayName ?? key;
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

function BundledNote({ catalog, parent }: { catalog: Catalog; parent: string }) {
  return (
    <span className="shrink-0 text-[11.5px] text-muted-foreground">
      Incluido con {labelOf(catalog, parent)}
    </span>
  );
}

// ── Info modal ───────────────────────────────────────────────────────────────

function ModuleInfoModal({
  catalog,
  moduleName,
  mod,
  activeMap,
  onClose,
}: {
  catalog: Catalog;
  moduleName: string;
  mod: TenantModuleResponse;
  activeMap: Map<string, boolean>;
  onClose: () => void;
}) {
  const meta = catalog[moduleName];
  if (!meta) return null;
  const iconName = meta.icon;

  const dependents = Object.entries(catalog)
    .filter(([key, def]) => key !== moduleName && activeMap.get(key) && def.dependencies.includes(moduleName))
    .map(([, def]) => def.displayName);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] ${
            mod.active ? 'bg-primary/10' : 'bg-muted/30'
          }`}>
            <ModuleIcon name={iconName} size={20} className={mod.active ? 'text-primary' : 'text-muted-foreground/60'} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <DialogTitle>{meta.displayName}</DialogTitle>
              {!meta.isStable && (
                <span className="rounded-full bg-warn-subtle px-2 py-0.5 text-[11px] font-medium text-warn">Beta</span>
              )}
              {mod.active && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Activo</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/60 mt-0.5">{meta.category}</p>
          </div>
        </div>

        <DialogDescription className="text-[13px] leading-relaxed">{meta.description}</DialogDescription>

        <div className="space-y-2.5 text-[12.5px]">
          <div>
            <p className="font-medium text-muted-foreground/70 mb-0.5">Requiere</p>
            <p className="text-foreground">
              {meta.dependencies.length > 0 ? meta.dependencies.map((d) => labelOf(catalog, d)).join(', ') : 'Ningún otro módulo'}
            </p>
          </div>
          {meta.bundledWith && (
            <div>
              <p className="font-medium text-muted-foreground/70 mb-0.5">Activación</p>
              <p className="text-foreground">Se activa y desactiva junto con {labelOf(catalog, meta.bundledWith)}</p>
            </div>
          )}
          <div>
            <p className="font-medium text-muted-foreground/70 mb-0.5">Dependen de este</p>
            <p className="text-foreground">{dependents.length > 0 ? dependents.join(', ') : 'Ningún módulo activo'}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Card actions (info + gear, shared by grid/list) ───────────────────────────

function CardActions({
  meta,
  active,
  onInfo,
}: {
  meta: CatalogModule;
  active: boolean;
  onInfo: () => void;
}) {
  const router = useRouter();
  const settingsHref = active ? meta.settingsHref : undefined;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {settingsHref && (
        <button
          type="button"
          onClick={() => router.push(settingsHref)}
          title={`Configurar ${meta.displayName}`}
          className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted/20 hover:text-foreground"
        >
          <SettingsIcon size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={onInfo}
        title={`Acerca de ${meta.displayName}`}
        className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted/20 hover:text-foreground"
      >
        <Info size={14} />
      </button>
    </div>
  );
}

// ── Grid card ──────────────────────────────────────────────────────────────────

function GridCard({
  catalog,
  mod,
  activeMap,
  canToggle,
  isPending,
  onToggle,
  onInfo,
}: {
  catalog: Catalog;
  mod: TenantModuleResponse;
  activeMap: Map<string, boolean>;
  canToggle: boolean;
  isPending: boolean;
  onToggle: () => void;
  onInfo: () => void;
}) {
  const meta = catalog[mod.moduleName];
  if (!meta) return null;

  const iconName = meta.icon;
  const inactiveDeps = meta.dependencies.filter((d) => !activeMap.get(d));
  const isLocked = !mod.active && inactiveDeps.length > 0;

  return (
    <div className={`flex flex-col rounded-[14px] border bg-card p-5 transition-colors ${
      mod.active ? 'border-primary/30' : 'border-border'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] ${
          mod.active ? 'bg-primary/10' : 'bg-muted/30'
        }`}>
          <ModuleIcon name={iconName} size={20} className={mod.active ? 'text-primary' : 'text-muted-foreground/60'} />
        </div>
        <CardActions meta={meta} active={mod.active} onInfo={onInfo} />
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

      {/* Footer */}
      <div className="mt-3 flex items-end justify-between gap-2">
        {isLocked ? (
          <div className="flex items-center gap-1 text-[11.5px] text-warn">
            <Lock size={10} />
            <span>Activá primero: {inactiveDeps.map((d) => labelOf(catalog, d)).join(', ')}</span>
          </div>
        ) : <span />}
        {meta.bundledWith ? (
          <BundledNote catalog={catalog} parent={meta.bundledWith} />
        ) : canToggle && (
          <Toggle
            checked={mod.active}
            disabled={isPending || isLocked}
            title={isLocked ? `Activá primero: ${inactiveDeps.map((d) => labelOf(catalog, d)).join(', ')}` : undefined}
            label={`${mod.active ? 'Desactivar' : 'Activar'} ${meta.displayName}`}
            onChange={onToggle}
          />
        )}
      </div>
    </div>
  );
}

// ── List row ───────────────────────────────────────────────────────────────────

function ListRow({
  catalog,
  mod,
  activeMap,
  canToggle,
  isPending,
  onToggle,
  onInfo,
}: {
  catalog: Catalog;
  mod: TenantModuleResponse;
  activeMap: Map<string, boolean>;
  canToggle: boolean;
  isPending: boolean;
  onToggle: () => void;
  onInfo: () => void;
}) {
  const meta = catalog[mod.moduleName];
  if (!meta) return null;

  const iconName = meta.icon;
  const inactiveDeps = meta.dependencies.filter((d) => !activeMap.get(d));
  const isLocked = !mod.active && inactiveDeps.length > 0;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
      {/* Icon */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
        mod.active ? 'bg-primary/10' : 'bg-muted/30'
      }`}>
        <ModuleIcon name={iconName} size={18} className={mod.active ? 'text-primary' : 'text-muted-foreground/60'} />
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

        {isLocked && (
          <div className="mt-1 flex items-center gap-1 text-[11.5px] text-warn">
            <Lock size={10} />
            <span>Activá primero: {inactiveDeps.map((d) => labelOf(catalog, d)).join(', ')}</span>
          </div>
        )}
      </div>

      <CardActions meta={meta} active={mod.active} onInfo={onInfo} />

      {/* Toggle */}
      {meta.bundledWith ? (
        <BundledNote catalog={catalog} parent={meta.bundledWith} />
      ) : canToggle && (
        <Toggle
          checked={mod.active}
          disabled={isPending || isLocked}
          title={isLocked ? `Activá primero: ${inactiveDeps.map((d) => labelOf(catalog, d)).join(', ')}` : undefined}
          label={`${mod.active ? 'Desactivar' : 'Activar'} ${meta.displayName}`}
          onChange={onToggle}
        />
      )}
    </div>
  );
}

// ── Planned (próximamente) card + row ─────────────────────────────────────────

function PlannedCard({ entry }: { entry: RoadmapModule }) {
  const iconName = entry.icon;
  return (
    <div className="flex flex-col rounded-[14px] border border-dashed border-border/70 bg-muted/5 p-5">
      <div className="mb-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-muted/20">
        <ModuleIcon name={iconName} size={20} className="text-muted-foreground/40" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <p className="text-[13.5px] font-semibold text-muted-foreground/70">{entry.displayName}</p>
        <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/60">
          Próximamente
        </span>
      </div>
      <p className="text-[12.5px] text-muted-foreground/50 leading-relaxed flex-1">{entry.description}</p>
    </div>
  );
}

function PlannedRow({ entry }: { entry: RoadmapModule }) {
  const iconName = entry.icon;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-dashed border-border/70 bg-muted/5 px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-muted/20">
        <ModuleIcon name={iconName} size={18} className="text-muted-foreground/40" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] font-semibold text-muted-foreground/70">{entry.displayName}</p>
          <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/60">
            Próximamente
          </span>
        </div>
        <p className="text-[12.5px] text-muted-foreground/50 mt-0.5">{entry.description}</p>
      </div>
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────

function Section({
  catalog,
  title,
  modules,
  planned,
  view,
  activeMap,
  canToggle,
  pendingName,
  onToggle,
  onInfo,
}: {
  catalog: Catalog;
  title: string;
  modules: TenantModuleResponse[];
  planned: RoadmapModule[];
  view: 'grid' | 'list';
  activeMap: Map<string, boolean>;
  canToggle: boolean;
  pendingName: string | undefined;
  onToggle: (moduleName: string, active: boolean) => void;
  onInfo: (moduleName: string) => void;
}) {
  if (modules.length === 0 && planned.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">{title}</h2>
      {view === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {modules.map((mod) => (
            <GridCard
              key={mod.id}
              catalog={catalog}
              mod={mod}
              activeMap={activeMap}
              canToggle={canToggle}
              isPending={pendingName === mod.moduleName}
              onToggle={() => onToggle(mod.moduleName, !mod.active)}
              onInfo={() => onInfo(mod.moduleName)}
            />
          ))}
          {planned.map((entry) => (
            <PlannedCard key={entry.displayName} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {modules.map((mod) => (
            <ListRow
              key={mod.id}
              catalog={catalog}
              mod={mod}
              activeMap={activeMap}
              canToggle={canToggle}
              isPending={pendingName === mod.moduleName}
              onToggle={() => onToggle(mod.moduleName, !mod.active)}
              onInfo={() => onInfo(mod.moduleName)}
            />
          ))}
          {planned.map((entry) => (
            <PlannedRow key={entry.displayName} entry={entry} />
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
  const [infoModule, setInfoModule] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ModuleStatusFilter>('all');

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['tenant-modules'],
    queryFn: tenantsApi.listModules,
  });
  const catalogQuery = useQuery({
    queryKey: ['module-catalog'],
    queryFn: tenantsApi.getModuleCatalog,
    staleTime: Infinity,
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
  const infoMod = infoModule ? modules.find((m) => m.moduleName === infoModule) : undefined;

  const catalog: Catalog = catalogQuery.data ? catalogByKey(catalogQuery.data) : {};
  const sections = catalogQuery.data
    ? catalogSections({
        catalog: catalogQuery.data,
        tenantModules: modules,
        search,
        status: statusFilter,
      })
    : [];
  const hasResults = sections.length > 0;

  function handleToggle(moduleName: string, active: boolean) {
    toggleMutation.mutate({ moduleName, active });
  }

  if (catalogQuery.isError) {
    return (
      <div role="alert" className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm font-medium text-foreground">No se pudo cargar el catálogo de módulos</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {apiErrorMessage(catalogQuery.error, 'Probá de nuevo en unos segundos.')}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void catalogQuery.refetch()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  if (isLoading || catalogQuery.isPending) {
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
            Activá o desactivá los módulos de tu empresa. Las tarjetas punteadas son funcionalidades planificadas, todavía no disponibles.
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

      {/* Search + filter toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar módulo..."
            className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-8 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              title="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="planned">Próximamente</option>
        </select>
      </div>

      {/* Error */}
      {toggleMutation.isError && (
        <div className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {apiErrorMessage(toggleMutation.error, 'Error al cambiar el módulo')}
        </div>
      )}

      {!hasResults ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search size={28} className="mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground/60">
            {search.trim() ? `Sin resultados para "${search}"` : 'Ningún módulo coincide con el filtro seleccionado'}
          </p>
        </div>
      ) : (
        sections.map((section) => (
          <Section
            key={section.category}
            catalog={catalog}
            title={section.category}
            modules={section.modules}
            planned={section.roadmap}
            view={view}
            activeMap={activeMap}
            canToggle={canToggle}
            pendingName={toggleMutation.isPending ? pendingName : undefined}
            onToggle={handleToggle}
            onInfo={setInfoModule}
          />
        ))
      )}

      {!canToggle && (
        <p className="text-xs text-muted-foreground/60 text-center">
          Necesitás el permiso <span className="font-mono">tenants:modules:manage</span> para modificar los módulos.
        </p>
      )}

      {infoMod && (
        <ModuleInfoModal
          catalog={catalog}
          moduleName={infoMod.moduleName}
          mod={infoMod}
          activeMap={activeMap}
          onClose={() => setInfoModule(null)}
        />
      )}
    </div>
  );
}

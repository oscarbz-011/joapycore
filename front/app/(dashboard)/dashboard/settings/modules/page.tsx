'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  LayoutGrid,
  List,
  Info,
  Settings as SettingsIcon,
  Search,
  X,
  Receipt,
  FileQuestion,
  Barcode,
  Landmark,
  Wallet,
  Coins,
  TrendingUp,
  Fingerprint,
  UserPlus,
  Navigation,
  Paperclip,
  FileSignature,
  BarChart3,
  Database,
  Workflow,
  Megaphone,
  Globe,
  Webhook,
  MessageCircle,
  Printer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { tenantsApi, type TenantModuleResponse } from '../../../../../lib/api/tenants';
import { useAuth } from '../../../../../lib/auth-context';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// ── Catalog (mirrors back-end MODULE_CATALOG) ──────────────────────────────────

interface CatalogEntry {
  displayName: string;
  description: string;
  icon: LucideIcon;
  category: string;
  dependencies: string[];
  isStable: boolean;
  /**
   * Ruta de configuración propia del módulo. Solo se define cuando el módulo
   * necesita una pantalla de ajustes que NO es parte de su uso diario (por
   * eso no vive ya como ítem del sidebar) — ej. registrar cajas una vez, no
   * vender todos los días. Si la operación diaria del módulo ya tiene su
   * propio grupo en el sidebar (Inventario, RRHH), no lleva settingsHref acá
   * para no duplicar el mismo acceso en dos lugares.
   */
  settingsHref?: string;
}

const CATALOG: Record<string, CatalogEntry> = {
  inventory:   { displayName: 'Inventario',      icon: Package,       category: 'Inventario y Productos', description: 'Gestión de productos, stock y movimientos de almacén',      dependencies: [],                                isStable: true  },
  sales:       { displayName: 'Ventas',          icon: ShoppingCart,  category: 'Ventas y CRM',           description: 'Pedidos, presupuestos y gestión de clientes',               dependencies: ['inventory'],                     isStable: true,  settingsHref: '/dashboard/settings/combos' },
  billing:     { displayName: 'Facturación',     icon: FileText,      category: 'Finanzas y Contabilidad', description: 'Emisión y administración de facturas',                     dependencies: ['sales'],                         isStable: true  },
  payments:    { displayName: 'Pagos',           icon: CreditCard,    category: 'Finanzas y Contabilidad', description: 'Cuentas por cobrar y registros de pago',                   dependencies: ['billing'],                       isStable: true  },
  procurement: { displayName: 'Compras',         icon: Truck,         category: 'Compras y Proveedores',  description: 'Órdenes de compra y gestión de proveedores',                dependencies: ['inventory'],                     isStable: true  },
  hr:          { displayName: 'Recursos Humanos', icon: Users,        category: 'Recursos Humanos',       description: 'Empleados, licencias y procesamiento de nómina',            dependencies: [],                                isStable: true  },
  finance:     { displayName: 'Financiamiento',  icon: Banknote,      category: 'Finanzas y Contabilidad', description: 'Créditos, planes de cuotas e installments',                dependencies: ['sales', 'billing'],              isStable: true,  settingsHref: '/dashboard/settings/credit' },
  collections: { displayName: 'Cobranzas',       icon: ClipboardList, category: 'Finanzas y Contabilidad', description: 'Asignación de cobradores y gestión de mora',               dependencies: ['finance'],                       isStable: true  },
  pos:         { displayName: 'Punto de Venta',  icon: Monitor,       category: 'Punto de Venta',         description: 'Venta rápida con código de barras y caja',                  dependencies: ['sales', 'inventory', 'billing'], isStable: false, settingsHref: '/dashboard/settings/pos-terminals' },
  logistics:   { displayName: 'Logística',       icon: Route,         category: 'Logística',              description: 'Entrada, salida, almacenamiento y transporte de mercancías', dependencies: ['inventory'],                     isStable: false },
  crm:         { displayName: 'CRM',             icon: Network,       category: 'Ventas y CRM',           description: 'Gestión de contactos, leads, deals y campañas comerciales', dependencies: ['sales'],                         isStable: false },
  projects:    { displayName: 'Proyectos',       icon: FolderKanban,  category: 'Proyectos',              description: 'Gestión de proyectos, tareas, timesheet y recursos',       dependencies: [],                                isStable: false },
  assets:      { displayName: 'Activos Fijos',   icon: Boxes,         category: 'Activos Fijos',          description: 'Registro, asignación y mantenimiento de activos empresariales', dependencies: [],                            isStable: false },
  documents:   { displayName: 'Documentos',      icon: FolderOpen,    category: 'Documentos',             description: 'Repositorio de documentos, políticas y contratos',         dependencies: [],                                isStable: false },
};

// ── Próximamente — módulos que todavía no existen, agrupados en la misma
// taxonomía, para decidir a futuro cuáles construir y cuáles descartar. ──────

interface PlannedEntry {
  displayName: string;
  description: string;
  icon: LucideIcon;
  category: string;
}

const PLANNED: PlannedEntry[] = [
  { displayName: 'Automatización de Marketing', icon: Megaphone,      category: 'Ventas y CRM',            description: 'Campañas de email/WhatsApp y seguimiento de leads automatizado' },
  { displayName: 'Cuentas por Pagar (AP)',      icon: Receipt,        category: 'Compras y Proveedores',    description: 'Registro y pago de facturas de proveedores, vencimientos y saldo por pagar' },
  { displayName: 'Cotizaciones a Proveedores',  icon: FileQuestion,   category: 'Compras y Proveedores',    description: 'Solicitar y comparar presupuestos de varios proveedores antes de comprar' },
  { displayName: 'Códigos de Barra y Etiquetas', icon: Barcode,       category: 'Inventario y Productos',   description: 'Generación e impresión de códigos de barra y QR para productos' },
  { displayName: 'Contabilidad',                icon: Landmark,       category: 'Finanzas y Contabilidad',  description: 'Libro mayor, partida doble y estados contables' },
  { displayName: 'Tesorería y Conciliación',    icon: Wallet,         category: 'Finanzas y Contabilidad',  description: 'Conciliación de movimientos bancarios y flujo de caja' },
  { displayName: 'Multi-moneda',                icon: Coins,          category: 'Finanzas y Contabilidad',  description: 'Precios y cobros en más de una moneda' },
  { displayName: 'Nómina Variable',             icon: TrendingUp,     category: 'Recursos Humanos',         description: 'Comisiones, bonos por meta y reglas de cálculo por cargo' },
  { displayName: 'Control de Asistencia',       icon: Fingerprint,    category: 'Recursos Humanos',         description: 'Marcación de entrada/salida y cálculo de horas trabajadas' },
  { displayName: 'Reclutamiento',               icon: UserPlus,       category: 'Recursos Humanos',         description: 'Gestión de postulantes y procesos de selección' },
  { displayName: 'Impresión de Tickets',        icon: Printer,        category: 'Punto de Venta',           description: 'Impresión de recibos y códigos de barra desde la caja' },
  { displayName: 'Rutas de Reparto',            icon: Navigation,     category: 'Logística',                description: 'Planificación y seguimiento de rutas de entrega' },
  { displayName: 'Archivos Adjuntos',           icon: Paperclip,      category: 'Documentos',               description: 'Almacenamiento centralizado de archivos vinculados a clientes, ventas y compras' },
  { displayName: 'Firma Electrónica',           icon: FileSignature,  category: 'Documentos',               description: 'Firma digital de contratos y documentos' },
  { displayName: 'Reportes Avanzados / BI',     icon: BarChart3,      category: 'Herramientas y Sistema',   description: 'Tableros y reportes personalizables más allá de los reportes básicos' },
  { displayName: 'Importación y Exportación',   icon: Database,       category: 'Herramientas y Sistema',   description: 'Carga y descarga masiva de datos en Excel/CSV' },
  { displayName: 'Automatización de Flujos',    icon: Workflow,       category: 'Herramientas y Sistema',   description: 'Reglas y flujos de trabajo configurables entre módulos' },
  { displayName: 'Pagos Online',                icon: Globe,          category: 'Integraciones',            description: 'Pasarela de pago para cobrar ventas por internet' },
  { displayName: 'WhatsApp Business',           icon: MessageCircle,  category: 'Integraciones',            description: 'Notificaciones y mensajes automáticos por WhatsApp' },
  { displayName: 'API y Webhooks',              icon: Webhook,        category: 'Integraciones',            description: 'Integración con sistemas externos vía API pública' },
];

const CATEGORY_ORDER = [
  'Inventario y Productos', 'Ventas y CRM', 'Compras y Proveedores', 'Finanzas y Contabilidad',
  'Logística', 'Recursos Humanos', 'Punto de Venta', 'Proyectos', 'Activos Fijos', 'Documentos',
  'Herramientas y Sistema', 'Integraciones',
];

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

// ── Info modal ───────────────────────────────────────────────────────────────

function ModuleInfoModal({
  moduleName,
  mod,
  activeMap,
  onClose,
}: {
  moduleName: string;
  mod: TenantModuleResponse;
  activeMap: Map<string, boolean>;
  onClose: () => void;
}) {
  const meta = CATALOG[moduleName];
  if (!meta) return null;
  const Icon = meta.icon;

  const dependents = Object.entries(CATALOG)
    .filter(([key, def]) => key !== moduleName && activeMap.get(key) && def.dependencies.includes(moduleName))
    .map(([, def]) => def.displayName);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] ${
            mod.active ? 'bg-primary/10' : 'bg-muted/30'
          }`}>
            <Icon size={20} className={mod.active ? 'text-primary' : 'text-muted-foreground/60'} />
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
              {meta.dependencies.length > 0 ? meta.dependencies.map(depLabel).join(', ') : 'Ningún otro módulo'}
            </p>
          </div>
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
  moduleName,
  active,
  onInfo,
}: {
  moduleName: string;
  active: boolean;
  onInfo: () => void;
}) {
  const router = useRouter();
  const meta = CATALOG[moduleName];
  const showSettings = active && !!meta?.settingsHref;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showSettings && (
        <button
          type="button"
          onClick={() => router.push(meta!.settingsHref!)}
          title={`Configurar ${meta!.displayName}`}
          className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted/20 hover:text-foreground"
        >
          <SettingsIcon size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={onInfo}
        title={`Acerca de ${meta?.displayName ?? moduleName}`}
        className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted/20 hover:text-foreground"
      >
        <Info size={14} />
      </button>
    </div>
  );
}

// ── Grid card ──────────────────────────────────────────────────────────────────

function GridCard({
  mod,
  activeMap,
  canToggle,
  isPending,
  onToggle,
  onInfo,
}: {
  mod: TenantModuleResponse;
  activeMap: Map<string, boolean>;
  canToggle: boolean;
  isPending: boolean;
  onToggle: () => void;
  onInfo: () => void;
}) {
  const meta = CATALOG[mod.moduleName];
  if (!meta) return null;

  const Icon = meta.icon;
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
          <Icon size={20} className={mod.active ? 'text-primary' : 'text-muted-foreground/60'} />
        </div>
        <CardActions moduleName={mod.moduleName} active={mod.active} onInfo={onInfo} />
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
            <span>Activá primero: {inactiveDeps.map(depLabel).join(', ')}</span>
          </div>
        ) : <span />}
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
  onInfo,
}: {
  mod: TenantModuleResponse;
  activeMap: Map<string, boolean>;
  canToggle: boolean;
  isPending: boolean;
  onToggle: () => void;
  onInfo: () => void;
}) {
  const meta = CATALOG[mod.moduleName];
  if (!meta) return null;

  const Icon = meta.icon;
  const inactiveDeps = meta.dependencies.filter((d) => !activeMap.get(d));
  const isLocked = !mod.active && inactiveDeps.length > 0;

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

        {isLocked && (
          <div className="mt-1 flex items-center gap-1 text-[11.5px] text-warn">
            <Lock size={10} />
            <span>Activá primero: {inactiveDeps.map(depLabel).join(', ')}</span>
          </div>
        )}
      </div>

      <CardActions moduleName={mod.moduleName} active={mod.active} onInfo={onInfo} />

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

// ── Planned (próximamente) card + row ─────────────────────────────────────────

function PlannedCard({ entry }: { entry: PlannedEntry }) {
  const Icon = entry.icon;
  return (
    <div className="flex flex-col rounded-[14px] border border-dashed border-border/70 bg-muted/5 p-5">
      <div className="mb-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-muted/20">
        <Icon size={20} className="text-muted-foreground/40" />
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

function PlannedRow({ entry }: { entry: PlannedEntry }) {
  const Icon = entry.icon;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-dashed border-border/70 bg-muted/5 px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-muted/20">
        <Icon size={18} className="text-muted-foreground/40" />
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
  title: string;
  modules: TenantModuleResponse[];
  planned: PlannedEntry[];
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'planned'>('all');

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
  const infoMod = infoModule ? modules.find((m) => m.moduleName === infoModule) : undefined;

  function normalize(s: string) {
    return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }
  const query = normalize(search.trim());
  function matchesQuery(name: string, description: string) {
    if (!query) return true;
    return normalize(name).includes(query) || normalize(description).includes(query);
  }

  const filteredModules = modules.filter((mod) => {
    const meta = CATALOG[mod.moduleName];
    if (!meta) return false;
    if (statusFilter === 'planned') return false;
    if (statusFilter === 'active' && !mod.active) return false;
    if (statusFilter === 'inactive' && mod.active) return false;
    return matchesQuery(meta.displayName, meta.description);
  });

  const filteredPlanned =
    statusFilter === 'active' || statusFilter === 'inactive'
      ? []
      : PLANNED.filter((entry) => matchesQuery(entry.displayName, entry.description));

  const byCategory = new Map<string, TenantModuleResponse[]>();
  for (const mod of filteredModules) {
    const category = CATALOG[mod.moduleName]?.category ?? 'Otros';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(mod);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => (CATALOG[a.moduleName]?.displayName ?? a.moduleName).localeCompare(CATALOG[b.moduleName]?.displayName ?? b.moduleName));
  }

  const plannedByCategory = new Map<string, PlannedEntry[]>();
  for (const entry of filteredPlanned) {
    if (!plannedByCategory.has(entry.category)) plannedByCategory.set(entry.category, []);
    plannedByCategory.get(entry.category)!.push(entry);
  }

  const allCategories = new Set([...byCategory.keys(), ...plannedByCategory.keys()]);
  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => allCategories.has(c)),
    ...[...allCategories].filter((c) => !CATEGORY_ORDER.includes(c)),
  ];
  const hasResults = orderedCategories.length > 0;

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
          {(toggleMutation.error as Error & { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Error al cambiar el módulo'}
        </div>
      )}

      {!hasResults ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search size={28} className="mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground/60">
            {query ? `Sin resultados para "${search}"` : 'Ningún módulo coincide con el filtro seleccionado'}
          </p>
        </div>
      ) : (
        orderedCategories.map((category) => (
          <Section
            key={category}
            title={category}
            modules={byCategory.get(category) ?? []}
            planned={plannedByCategory.get(category) ?? []}
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
          moduleName={infoMod.moduleName}
          mod={infoMod}
          activeMap={activeMap}
          onClose={() => setInfoModule(null)}
        />
      )}
    </div>
  );
}

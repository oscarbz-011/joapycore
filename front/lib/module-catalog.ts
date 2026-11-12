import {
  Banknote,
  BarChart3,
  Barcode,
  Boxes,
  ClipboardList,
  Coins,
  CreditCard,
  Database,
  FileQuestion,
  FileSignature,
  FileText,
  Fingerprint,
  FolderKanban,
  FolderOpen,
  Globe,
  Hammer,
  Landmark,
  Megaphone,
  MessageCircle,
  Monitor,
  Navigation,
  Network,
  Package,
  Paperclip,
  Printer,
  Puzzle,
  Receipt,
  Route,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  Wallet,
  Webhook,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { settingsHrefFor } from '@/modules/registry';
import type {
  ModuleCatalog,
  ModuleCatalogEntry,
  RoadmapModule,
  TenantModuleResponse,
} from './api/tenants';

// El backend nombra el ícono; importarlos todos agrandaría el bundle.
const ICONS: Record<string, LucideIcon> = {
  Banknote,
  BarChart3,
  Barcode,
  Boxes,
  ClipboardList,
  Coins,
  CreditCard,
  Database,
  FileQuestion,
  FileSignature,
  FileText,
  Fingerprint,
  FolderKanban,
  FolderOpen,
  Globe,
  Hammer,
  Landmark,
  Megaphone,
  MessageCircle,
  Monitor,
  Navigation,
  Network,
  Package,
  Paperclip,
  Printer,
  Receipt,
  Route,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  Wallet,
  Webhook,
  Workflow,
};

export function moduleIcon(name: string): LucideIcon {
  return ICONS[name] ?? Puzzle;
}

export interface CatalogModule extends ModuleCatalogEntry {
  /** Su pantalla de configuración, si el módulo tiene una. */
  settingsHref?: string;
}

export function catalogByKey(catalog: ModuleCatalog): Record<string, CatalogModule> {
  return Object.fromEntries(
    catalog.modules.map((m) => {
      const settingsHref = settingsHrefFor(m.key);
      return [m.key, settingsHref ? { ...m, settingsHref } : m];
    }),
  );
}

export type ModuleStatusFilter = 'all' | 'active' | 'inactive' | 'planned';

export interface CatalogSection {
  category: string;
  modules: TenantModuleResponse[];
  roadmap: RoadmapModule[];
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Los módulos de la empresa y los anunciados, filtrados y agrupados por categoría. */
export function catalogSections(input: {
  catalog: ModuleCatalog;
  tenantModules: TenantModuleResponse[];
  search: string;
  status: ModuleStatusFilter;
}): CatalogSection[] {
  const byKey = new Map(input.catalog.modules.map((m) => [m.key, m]));
  const query = normalize(input.search.trim());
  const matches = (entry: { displayName: string; description: string }) =>
    !query ||
    normalize(entry.displayName).includes(query) ||
    normalize(entry.description).includes(query);

  const modules =
    input.status === 'planned'
      ? []
      : input.tenantModules.filter((mod) => {
          const entry = byKey.get(mod.moduleName);
          if (!entry) return false;
          if (input.status === 'active' && !mod.active) return false;
          if (input.status === 'inactive' && mod.active) return false;
          return matches(entry);
        });
  const roadmap =
    input.status === 'active' || input.status === 'inactive'
      ? []
      : input.catalog.roadmap.filter(matches);

  const nameOf = (mod: TenantModuleResponse) =>
    byKey.get(mod.moduleName)?.displayName ?? mod.moduleName;
  const categoryOf = (mod: TenantModuleResponse) =>
    byKey.get(mod.moduleName)?.category ?? 'Otros';
  const used = new Set([...modules.map(categoryOf), ...roadmap.map((r) => r.category)]);
  const ordered = [
    ...input.catalog.categories.filter((c) => used.has(c)),
    ...[...used].filter((c) => !input.catalog.categories.includes(c)),
  ];

  return ordered.map((category) => ({
    category,
    modules: modules
      .filter((mod) => categoryOf(mod) === category)
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    roadmap: roadmap.filter((r) => r.category === category),
  }));
}

import { checkRouteAccess } from '@/lib/route-access';
import { FRONT_MODULES } from './registry';
import { routeRulesOf } from './routes';
import type { FrontModuleManifest, NavEntry, NavSection } from './types';

export interface NavItem {
  label: string;
  href: string;
  stub?: boolean;
  badge?: number;
}

export interface NavGroup extends NavSection {
  items: NavItem[];
}

/**
 * El menú que ve una persona: una entrada aparece si su módulo está activo y
 * la persona puede abrir la pantalla. Las entradas apagadas acompañan a las
 * que existen; una sección hecha solo de entradas apagadas usa sus propias
 * condiciones.
 */
export function buildNavigation(
  activeModules: readonly string[],
  permissions: readonly string[],
  manifests: readonly FrontModuleManifest[] = FRONT_MODULES,
): NavGroup[] {
  const rules = routeRulesOf(manifests);
  const entries = manifests.flatMap((m) =>
    (m.nav ?? []).map((entry) => ({ entry, module: m.module })),
  );

  const canSee = ({ entry, module }: { entry: NavEntry; module?: string }) =>
    (!module || activeModules.includes(module)) &&
    (!entry.modules || entry.modules.some((key) => activeModules.includes(key))) &&
    (!entry.anyPermission || entry.anyPermission.some((p) => permissions.includes(p))) &&
    (entry.stub ||
      checkRouteAccess(
        entry.href.split('?')[0],
        [...activeModules],
        [...permissions],
        rules,
      ).allowed);

  return manifests
    .flatMap((m) => m.sections ?? [])
    .map((section) => {
      const own = entries.filter(({ entry }) => entry.section === section.id);
      const visible = own.filter(canSee);
      const hasScreens = own.some(({ entry }) => !entry.stub);
      const shown = hasScreens
        ? visible.some(({ entry }) => !entry.stub)
        : visible.length > 0;
      const items: NavItem[] = shown
        ? visible.map(({ entry }) => ({
            label: entry.label,
            href: entry.href,
            ...(entry.stub ? { stub: true } : {}),
          }))
        : [];
      return { ...section, items };
    })
    .filter((group) => group.items.length > 0)
    .sort(
      (a, b) => Number(!!a.bottom) - Number(!!b.bottom) || a.order - b.order,
    );
}

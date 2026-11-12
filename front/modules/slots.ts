import type { ComponentType } from 'react';
import { FRONT_MODULES } from './registry';
import type { SlotName, SlotProps } from './slot-types';
import type { FrontModuleManifest } from './types';

export interface SlotContribution<K extends SlotName> {
  /** El manifiesto que la aporta. */
  id: string;
  Component: ComponentType<SlotProps[K]>;
}

/** Lo que aportan a un lugar los módulos activos, en el orden del registro. */
export function slotContributions<K extends SlotName>(
  name: K,
  activeModules: readonly string[],
  manifests: readonly FrontModuleManifest[] = FRONT_MODULES,
): SlotContribution<K>[] {
  return manifests.flatMap((m) => {
    const Component = m.slots?.[name] as ComponentType<SlotProps[K]> | undefined;
    if (!Component) return [];
    if (m.module && !activeModules.includes(m.module)) return [];
    return [{ id: m.id, Component }];
  });
}

import type { Prisma } from '@prisma/client';

// core: siempre activo, sin fila en TenantModule ni @RequiredModule.
// addon: lo activa el tenant; sus controllers llevan @RequiredModule(key).
// feature: parte opcional de un addon; usa la clave del padre en el guard.
export type ModuleKind = 'core' | 'addon' | 'feature';

export interface ModuleManifest {
  /** TenantModule.moduleName y la clave de @RequiredModule. */
  key: string;
  kind: ModuleKind;
  displayName: string;
  description: string;
  icon: string;
  isStable: boolean;
  parent?: string;
  /** Los addons se exigen activos; solo se importa código de esta lista. */
  depends: string[];
  /** Solo este módulo escribe estas tablas. */
  owns: Prisma.ModelName[];
}

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  return manifest;
}

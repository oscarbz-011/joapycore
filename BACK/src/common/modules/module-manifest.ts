import type { Prisma } from '@prisma/client';

/**
 * - `core`: siempre activo, sin fila en TenantModule ni `@RequiredModule`.
 * - `addon`: el tenant lo activa o desactiva; sus controllers llevan
 *   `@RequiredModule(key)`.
 * - `feature`: parte opcional de un addon con carpeta propia; usa la clave
 *   del addon padre en `@RequiredModule` y se activa con su propia config.
 */
export type ModuleKind = 'core' | 'addon' | 'feature';

export interface ModuleManifest {
  /** Clave estable: TenantModule.moduleName y `@RequiredModule`. */
  key: string;
  kind: ModuleKind;
  displayName: string;
  description: string;
  icon: string;
  /** false = se muestra como "Próximamente / Beta". */
  isStable: boolean;
  /** Addon padre de un `feature`. */
  parent?: string;
  /**
   * Módulos que tienen que estar presentes. Los addons de esta lista se
   * exigen activos al activar este; los core siempre lo están. Importar
   * código de otro módulo solo se permite hacia esta lista.
   */
  depends: string[];
  /** Tablas de las que es dueño: solo este módulo las escribe. */
  owns: Prisma.ModelName[];
}

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  return manifest;
}

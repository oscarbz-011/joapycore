import { Industry } from '@prisma/client';
import { MODULE_REGISTRY } from '../modules/module-registry';

export interface ModuleDefinition {
  displayName: string;
  description: string;
  icon: string;
  /** Keys of modules that must be active before this one can be activated. */
  dependencies: string[];
  /** false = visible en el catálogo pero marcado como "Próximamente / Beta". */
  isStable: boolean;
  /** Se activa y desactiva junto con este addon; no tiene interruptor propio. */
  bundledWith?: string;
}

const addonKeys = new Set(
  MODULE_REGISTRY.filter((m) => m.kind === 'addon').map((m) => m.key),
);

// Los módulos que el tenant activa o desactiva, generados desde los
// manifiestos (ver common/modules). Los core no tienen fila en TenantModule:
// como dependencia se cumplen siempre.
export const MODULE_CATALOG: Record<string, ModuleDefinition> =
  Object.fromEntries(
    MODULE_REGISTRY.filter((m) => m.kind === 'addon').map((m) => [
      m.key,
      {
        displayName: m.displayName,
        description: m.description,
        icon: m.icon,
        dependencies: m.depends.filter((dep) => addonKeys.has(dep)),
        isStable: m.isStable,
        ...(m.bundledWith ? { bundledWith: m.bundledWith } : {}),
      },
    ]),
  );

export const ALL_TENANT_MODULES = Object.keys(MODULE_CATALOG);

/**
 * Módulos activos por defecto al registrarse según el rubro.
 * Solo se usan como template de onboarding — el tenant puede
 * activar/desactivar cualquier módulo del catálogo después.
 */
// Módulos que se activan al registrar un tenant, según su rubro. La clave pasó
// de texto libre al enum Industry junto con Tenant.industry.
export const MODULE_TEMPLATES: Record<Industry, string[]> = {
  ELECTRODOMESTICOS: [
    'inventory',
    'sales',
    'billing',
    'payments',
    'procurement',
    'finance',
    'collections',
    'hr',
  ],
  FERRETERIA: ['inventory', 'sales', 'billing', 'payments', 'procurement'],
  SUPERMERCADO: ['inventory', 'sales', 'billing', 'payments', 'pos'],
  SERVICIOS: ['sales', 'billing', 'payments', 'hr'],
  // Una carpintería fabrica lo que vende: necesita producción además de
  // compras (para la materia prima). Ver ProductKind.
  MUEBLERIA: [
    'inventory',
    'sales',
    'billing',
    'payments',
    'procurement',
    'production',
  ],
  OTRO: ['inventory', 'sales', 'billing', 'payments'],
};

// Fallback cuando el tenant no eligió rubro (industry null).
export const FALLBACK_MODULES = MODULE_TEMPLATES.OTRO;

import { assetsManifest } from './assets/manifest';
import { billingManifest } from './billing/manifest';
import { collectionsManifest } from './collections/manifest';
import { crmManifest } from './crm/manifest';
import { documentsManifest } from './documents/manifest';
import { financeManifest } from './finance/manifest';
import { hrManifest } from './hr/manifest';
import { inventoryManifest } from './inventory/manifest';
import { logisticsManifest } from './logistics/manifest';
import { paymentsManifest } from './payments/manifest';
import { platformManifest } from './platform/manifest';
import { posManifest } from './pos/manifest';
import { procurementManifest } from './procurement/manifest';
import { productionManifest } from './production/manifest';
import { projectsManifest } from './projects/manifest';
import { reportsManifest } from './reports/manifest';
import { salesManifest } from './sales/manifest';
import { sifenManifest } from './sifen/manifest';
import type { FrontModuleManifest } from './types';

// Cuando varios módulos aportan a una misma sección del menú, sus entradas
// salen en este orden.
export const FRONT_MODULES: readonly FrontModuleManifest[] = [
  platformManifest,
  inventoryManifest,
  salesManifest,
  procurementManifest,
  productionManifest,
  billingManifest,
  sifenManifest,
  financeManifest,
  paymentsManifest,
  collectionsManifest,
  reportsManifest,
  logisticsManifest,
  hrManifest,
  crmManifest,
  projectsManifest,
  posManifest,
  assetsManifest,
  documentsManifest,
];

export function settingsHrefFor(moduleKey: string): string | undefined {
  return FRONT_MODULES.find((m) => m.module === moduleKey)?.settingsHref;
}

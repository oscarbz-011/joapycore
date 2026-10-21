import { alertsManifest } from '../../modules/alerts/module.manifest';
import { billingManifest } from '../../modules/billing/module.manifest';
import { branchesManifest } from '../../modules/branches/module.manifest';
import { collectionsManifest } from '../../modules/cobranzas/module.manifest';
import { creditBureauManifest } from '../../modules/credit-bureau/module.manifest';
import { documentsManifest } from '../../modules/documents/module.manifest';
import { financeManifest } from '../../modules/finance/module.manifest';
import { hrManifest } from '../../modules/hr/module.manifest';
import { inventoryManifest } from '../../modules/inventory/module.manifest';
import { logisticsManifest } from '../../modules/logistics/module.manifest';
import { paymentsManifest } from '../../modules/payments/module.manifest';
import { posManifest } from '../../modules/pos/module.manifest';
import { procurementManifest } from '../../modules/procurement/module.manifest';
import { productionManifest } from '../../modules/production/module.manifest';
import { reportsManifest } from '../../modules/reports/module.manifest';
import { salesManifest } from '../../modules/sales/module.manifest';
import { sifenManifest } from '../../modules/sifen/module.manifest';
import { warehousesManifest } from '../../modules/warehouses/module.manifest';
import type { ModuleManifest } from './module-manifest';
import {
  assetsManifest,
  crmManifest,
  projectsManifest,
} from './planned.manifests';

// El orden de los addons es el del catálogo en Ajustes → Módulos.
export const MODULE_REGISTRY: readonly ModuleManifest[] = [
  inventoryManifest,
  salesManifest,
  billingManifest,
  paymentsManifest,
  procurementManifest,
  hrManifest,
  financeManifest,
  collectionsManifest,
  posManifest,
  logisticsManifest,
  crmManifest,
  projectsManifest,
  assetsManifest,
  documentsManifest,
  productionManifest,
  creditBureauManifest,
  branchesManifest,
  warehousesManifest,
  alertsManifest,
  reportsManifest,
  sifenManifest,
];

const byKey = new Map(MODULE_REGISTRY.map((m) => [m.key, m]));

export function getManifest(key: string): ModuleManifest | undefined {
  return byKey.get(key);
}

export const CORE_MODULE_KEYS = MODULE_REGISTRY.filter(
  (m) => m.kind === 'core',
).map((m) => m.key);

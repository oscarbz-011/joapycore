import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_TENANT_MODULES } from '../common/constants/modules.constant';
import type {
  InitialDataDefinition,
  InitialDataItem,
} from './initial-data.types';

const MODULES_DIR = join(__dirname, '..', 'modules');

function isDefinition(
  value: unknown,
): value is InitialDataDefinition<InitialDataItem> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'module' in value &&
    'versions' in value
  );
}

function declaredDefinitions() {
  const found: {
    file: string;
    definition: InitialDataDefinition<InitialDataItem>;
  }[] = [];
  for (const moduleDir of readdirSync(MODULES_DIR)) {
    const dataDir = join(MODULES_DIR, moduleDir, 'data');
    if (!existsSync(dataDir)) continue;
    for (const file of readdirSync(dataDir)) {
      if (!file.endsWith('.data.ts')) continue;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const exported = require(join(dataDir, file)) as Record<string, unknown>;
      for (const value of Object.values(exported)) {
        if (isDefinition(value)) {
          found.push({ file: `${moduleDir}/data/${file}`, definition: value });
        }
      }
    }
  }
  return found;
}

describe('datos iniciales declarados en las carpetas data/', () => {
  const declared = declaredDefinitions();

  it('finds the sets that replaced the scattered seeds', () => {
    expect(declared.map((d) => d.definition.name).sort()).toEqual([
      'documents.billing-templates',
      'documents.categories',
      'inventory.categories',
    ]);
  });

  it('only depend on modules of the catalog', () => {
    const unknown = declared.filter(
      (d) => !ALL_TENANT_MODULES.includes(d.definition.module),
    );
    expect(unknown).toEqual([]);
  });

  it('use a name per set and a key per item', () => {
    const names = declared.map((d) => d.definition.name);
    expect(new Set(names).size).toBe(names.length);
    for (const { definition } of declared) {
      for (const version of definition.versions) {
        const keys = version.items.map((item) => item.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });
});

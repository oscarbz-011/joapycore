import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { MODULE_CATALOG } from '../constants/modules.constant';
import { KNOWN_BOUNDARY_DEBT } from './module-boundary-debt';
import type { ModuleManifest } from './module-manifest';
import { MODULE_REGISTRY } from './module-registry';
import { PLATFORM_TABLES } from './platform-tables';

// Hace cumplir lo que declaran los manifiestos: a qué módulo pertenece cada
// tabla, quién puede importar a quién y qué guard lleva cada controller. Lee
// el código como texto; no detecta accesos por `include` de relaciones.

const SRC = resolve(__dirname, '../..');
const MODULES_DIR = join(SRC, 'modules');
const SCHEMA = resolve(SRC, '../prisma/schema.prisma');

const WRITE_METHODS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);
const READ_METHODS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);
const DELEGATE_CALL = new RegExp(
  String.raw`\b[\w$]+\.([a-z][A-Za-z]+)\.(${[...WRITE_METHODS, ...READ_METHODS].join('|')})\(`,
  'g',
);

const schemaModels = [
  ...readFileSync(SCHEMA, 'utf8').matchAll(/^model (\w+) \{/gm),
].map((m) => m[1]);
const delegateToModel = new Map(
  schemaModels.map((model) => [model[0].toLowerCase() + model.slice(1), model]),
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

const moduleDirs = readdirSync(MODULES_DIR).filter((name) =>
  statSync(join(MODULES_DIR, name)).isDirectory(),
);

function manifestOfDir(dir: string): ModuleManifest {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const exported = require(join(MODULES_DIR, dir, 'module.manifest')) as Record<
    string,
    ModuleManifest
  >;
  const manifests = Object.values(exported);
  if (manifests.length !== 1) {
    throw new Error(`modules/${dir}/module.manifest.ts debe exportar uno solo`);
  }
  return manifests[0];
}

const modulesByDir = new Map(
  moduleDirs.map((dir) => [dir, manifestOfDir(dir)]),
);

const ownerOf = new Map<string, string>();
for (const manifest of MODULE_REGISTRY) {
  for (const model of manifest.owns) ownerOf.set(model, manifest.key);
}
for (const model of PLATFORM_TABLES) ownerOf.set(model, 'platform');

const toPosix = (path: string) => relative(SRC, path).split(sep).join('/');

describe('Arquitectura modular', () => {
  describe('registro de módulos', () => {
    it('has one manifest per key', () => {
      const keys = MODULE_REGISTRY.map((m) => m.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('registers the manifest of every folder in src/modules', () => {
      for (const manifest of modulesByDir.values()) {
        expect(MODULE_REGISTRY).toContain(manifest);
      }
    });

    it('only depends on modules that exist', () => {
      const keys = new Set(MODULE_REGISTRY.map((m) => m.key));
      for (const m of MODULE_REGISTRY) {
        for (const dep of m.depends) {
          expect([m.key, dep, keys.has(dep)]).toEqual([m.key, dep, true]);
        }
      }
    });

    it('hangs every feature from an addon', () => {
      for (const m of MODULE_REGISTRY.filter((x) => x.kind === 'feature')) {
        const parent = MODULE_REGISTRY.find((x) => x.key === m.parent);
        expect([m.key, parent?.kind]).toEqual([m.key, 'addon']);
        expect(m.depends).toContain(m.parent);
      }
    });

    it('keeps core modules independent of addons', () => {
      const core = new Set(
        MODULE_REGISTRY.filter((m) => m.kind === 'core').map((m) => m.key),
      );
      for (const m of MODULE_REGISTRY.filter((x) => x.kind === 'core')) {
        expect([m.key, m.depends.filter((d) => !core.has(d))]).toEqual([
          m.key,
          [],
        ]);
      }
    });

    it('has no dependency cycles', () => {
      const deps = new Map(MODULE_REGISTRY.map((m) => [m.key, m.depends]));
      const visit = (key: string, path: string[]) => {
        if (path.includes(key)) {
          throw new Error(`Ciclo: ${[...path, key].join(' → ')}`);
        }
        for (const dep of deps.get(key) ?? []) visit(dep, [...path, key]);
      };
      for (const key of deps.keys()) visit(key, []);
    });

    it('only offers addons in the activation catalog', () => {
      const addons = MODULE_REGISTRY.filter((m) => m.kind === 'addon').map(
        (m) => m.key,
      );
      expect(Object.keys(MODULE_CATALOG)).toEqual(addons);
    });
  });

  describe('dueños de las tablas', () => {
    it('gives every Prisma model exactly one owner', () => {
      const declared = [
        ...MODULE_REGISTRY.flatMap((m) => m.owns),
        ...PLATFORM_TABLES,
      ];
      const repeated = declared.filter((m, i) => declared.indexOf(m) !== i);
      expect(repeated).toEqual([]);
      const unowned = schemaModels.filter((m) => !ownerOf.has(m));
      expect(unowned).toEqual([]);
    });
  });

  describe('guards de los controllers', () => {
    it('guards each controller with the key of its module', () => {
      const problems: string[] = [];
      for (const [dir, manifest] of modulesByDir) {
        const expected =
          manifest.kind === 'addon'
            ? manifest.key
            : manifest.kind === 'feature'
              ? manifest.parent
              : null;
        for (const file of sourceFiles(join(MODULES_DIR, dir))) {
          if (!file.endsWith('.controller.ts')) continue;
          const keys = [
            ...readFileSync(file, 'utf8').matchAll(
              /@RequiredModule\('([^']+)'\)/g,
            ),
          ].map((m) => m[1]);
          const ok = expected
            ? keys.length > 0 && keys.every((k) => k === expected)
            : keys.length === 0;
          if (!ok) {
            problems.push(
              `${toPosix(file)}: ${expected ? `@RequiredModule('${expected}')` : 'sin @RequiredModule (core)'}, tiene [${keys.join(', ')}]`,
            );
          }
        }
      }
      expect(problems).toEqual([]);
    });
  });

  describe('límites entre módulos', () => {
    it('only imports code from declared dependencies', () => {
      const problems: string[] = [];
      for (const [dir, manifest] of modulesByDir) {
        for (const file of sourceFiles(join(MODULES_DIR, dir))) {
          const imports = readFileSync(file, 'utf8').matchAll(
            /from '(\.[^']+)'/g,
          );
          for (const [, spec] of imports) {
            const target = relative(MODULES_DIR, resolve(file, '..', spec));
            const [targetDir] = target.split(sep);
            if (target.startsWith('..') || targetDir === dir) continue;
            const targetKey = modulesByDir.get(targetDir)?.key ?? targetDir;
            if (!manifest.depends.includes(targetKey)) {
              problems.push(`${toPosix(file)} → modules/${targetDir}`);
            }
          }
        }
      }
      expect(problems).toEqual([]);
    });

    it('touches other modules’ tables only where it is already known', () => {
      const found = new Map<string, Set<string>>();
      for (const [dir, manifest] of modulesByDir) {
        for (const file of sourceFiles(join(MODULES_DIR, dir))) {
          const isSources = file.endsWith('-sources.repository.ts');
          for (const [, delegate, method] of readFileSync(
            file,
            'utf8',
          ).matchAll(DELEGATE_CALL)) {
            const model = delegateToModel.get(delegate);
            if (!model || ownerOf.get(model) === manifest.key) continue;
            // Leer datos ajenos está permitido en el repositorio de
            // fuentes del módulo; escribirlos, nunca.
            if (isSources && READ_METHODS.has(method)) continue;
            const kind = WRITE_METHODS.has(method) ? 'write' : 'read';
            const key = toPosix(file);
            if (!found.has(key)) found.set(key, new Set());
            found.get(key)?.add(`${kind}:${model}`);
          }
        }
      }
      const actual = Object.fromEntries(
        [...found].map(([file, set]) => [file, [...set].sort()]),
      );
      const known = Object.fromEntries(
        Object.entries(KNOWN_BOUNDARY_DEBT).map(([file, list]) => [
          file,
          [...list].sort(),
        ]),
      );
      // Un acceso nuevo falla; uno que se corrigió también, para sacarlo de
      // la lista de deuda.
      expect(actual).toEqual(known);
    });
  });
});

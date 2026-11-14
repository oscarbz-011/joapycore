import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { declaredRules, resolveAccessRule } from './access-rule';

const SRC = resolve(__dirname, '../..');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

interface Route {
  name: string;
  handler: object;
  controller: object;
}

function routes(): Route[] {
  return controllerFiles(SRC).flatMap((file) => {
    const exports = require(file) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-require-imports
    return Object.values(exports)
      .filter(
        (value): value is new (...args: never[]) => object =>
          typeof value === 'function' &&
          Reflect.hasMetadata(PATH_METADATA, value),
      )
      .flatMap((controller) => {
        const proto = controller.prototype as Record<string, unknown>;
        return Object.getOwnPropertyNames(proto)
          .map((key) => [key, proto[key]] as const)
          .filter(
            ([, fn]) =>
              typeof fn === 'function' &&
              Reflect.getMetadata(METHOD_METADATA, fn) !== undefined,
          )
          .map(([key, handler]) => ({
            name: `${relative(SRC, file)} ${controller.name}.${key}`,
            handler: handler as object,
            controller,
          }));
      });
  });
}

describe('regla de acceso de cada endpoint', () => {
  const all = routes();

  it('finds the controllers', () => {
    expect(all.length).toBeGreaterThan(300);
  });

  it('every endpoint declares who can use it', () => {
    const missing = all
      .filter((r) => !resolveAccessRule(r.handler, r.controller))
      .map((r) => r.name);
    expect(missing).toEqual([]);
  });

  it('no method or controller declares two rules at once', () => {
    const ambiguous = all.flatMap((r) => [
      ...(declaredRules(r.handler).length > 1 ? [r.name] : []),
      ...(declaredRules(r.controller).length > 1
        ? [`${r.name} (controller)`]
        : []),
    ]);
    expect([...new Set(ambiguous)]).toEqual([]);
  });
});

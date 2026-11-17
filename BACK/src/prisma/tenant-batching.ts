import { AsyncLocalStorage } from 'node:async_hooks';
import { TenantContext } from './tenant-context';

type RunInContext = <R>(fn: () => R) => R;

interface LoaderOptions {
  batchBy?: (request: object) => string | undefined;
  singleLoader?: (request: object) => Promise<unknown>;
  batchLoader?: (requests: object[]) => Promise<unknown>;
}

interface BatchingInternals {
  _requestHandler?: { dataloader?: { options?: LoaderOptions } };
}

/**
 * Prisma junta los findUnique pedidos en el mismo tick y los despacha todos
 * desde un process.nextTick, con el contexto del primero que consultó: los de
 * otra empresa volverían vacíos. Cada tanda queda de una sola empresa y se
 * despacha con el contexto de quien la pidió. Usa partes internas de Prisma:
 * si cambian, falla al arrancar en vez de devolver vacíos.
 */
export function separateBatchesByTenant(client: object): void {
  const options = (client as BatchingInternals)._requestHandler?.dataloader
    ?.options;
  const { batchBy, singleLoader, batchLoader } = options ?? {};
  if (
    !options ||
    typeof batchBy !== 'function' ||
    typeof singleLoader !== 'function' ||
    typeof batchLoader !== 'function'
  ) {
    throw new Error(
      'Prisma cambió cómo agrupa las consultas: revisar separateBatchesByTenant',
    );
  }

  const contextOf = new WeakMap<object, RunInContext>();

  options.batchBy = (request) => {
    const key = batchBy(request);
    if (key === undefined) return key;
    // Se calcula en el contexto de quien consulta.
    contextOf.set(request, AsyncLocalStorage.snapshot());
    const tenant = TenantContext.isPlatform()
      ? '*'
      : (TenantContext.get() ?? '');
    return `${key}|tenant:${tenant}`;
  };

  options.singleLoader = (request) => {
    const run = contextOf.get(request);
    return run ? run(() => singleLoader(request)) : singleLoader(request);
  };

  options.batchLoader = (requests) => {
    const run = requests.length > 0 ? contextOf.get(requests[0]) : undefined;
    return run ? run(() => batchLoader(requests)) : batchLoader(requests);
  };
}

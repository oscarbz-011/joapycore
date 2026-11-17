import { TenantContext } from '../src/prisma/tenant-context';

// Los tests arman y limpian sus datos fuera de un pedido, como un script de
// mantenimiento: corren en modo plataforma. Lo que prueba el aislamiento entre
// empresas lo hace explícito con TenantContext.run.
type Fn = (...args: unknown[]) => unknown;

const asPlatform = (fn: Fn | undefined): Fn | undefined =>
  fn &&
  ((...args: unknown[]) =>
    TenantContext.runAsPlatform(() => Promise.resolve(fn(...args))));

for (const name of ['beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {
  const hook = (globalThis as unknown as Record<string, Fn>)[name];
  (globalThis as unknown as Record<string, Fn>)[name] = (
    fn: Fn,
    timeout?: number,
  ) => hook(asPlatform(fn), timeout);
}

for (const name of ['it', 'test']) {
  const original = (globalThis as unknown as Record<string, Fn>)[name];
  const wrapped = Object.assign(
    (title: string, fn?: Fn, timeout?: number) =>
      original(title, asPlatform(fn), timeout),
    original,
  );
  (globalThis as unknown as Record<string, Fn>)[name] = wrapped;
}

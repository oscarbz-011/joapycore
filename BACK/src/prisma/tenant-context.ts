import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  tenantId?: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

/**
 * Empresa activa del pedido o del trabajo en curso. TenantPool la pasa a
 * Postgres al entregar cada conexión, y la seguridad de filas filtra por ella.
 */
export const TenantContext = {
  /** Abre un contexto vacío; la autenticación le pone la empresa después. */
  runRequest<T>(fn: () => T): T {
    return storage.run({}, fn);
  },

  /**
   * Corre un trabajo como la empresa indicada. Las promesas de Prisma son
   * perezosas: se esperan adentro para que la consulta salga con este contexto.
   */
  run<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return storage.run({ tenantId }, async () => await fn());
  },

  set(tenantId: string): void {
    const store = storage.getStore();
    if (!store) {
      throw new Error('No hay un contexto de empresa abierto');
    }
    if (store.tenantId && store.tenantId !== tenantId) {
      throw new Error('El contexto ya pertenece a otra empresa');
    }
    store.tenantId = tenantId;
  },

  get(): string | undefined {
    return storage.getStore()?.tenantId;
  },
};

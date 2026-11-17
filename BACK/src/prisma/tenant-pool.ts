import { Pool, PoolClient } from 'pg';
import { TenantContext } from './tenant-context';

export const TENANT_SETTING = 'app.tenant_id';

type ConnectCallback = (
  err: Error | undefined,
  client?: PoolClient,
  done?: (release?: unknown) => void,
) => void;

/**
 * Pool que fija la empresa del contexto en cada conexión que entrega. El
 * adaptador de Prisma pide conexión tanto para consultas sueltas (pool.query
 * pasa por connect) como para transacciones, así que ninguna sale sin ella.
 * Sin empresa en el contexto se fija vacía: la seguridad de filas no deja ver
 * nada.
 */
export class TenantPool extends Pool {
  private readonly applied = new WeakMap<PoolClient, string>();

  connect(): Promise<PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    // Se lee al pedir la conexión: si hay que esperar una libre, el callback
    // corre en el contexto de quien la liberó.
    const tenantId = TenantContext.get() ?? '';
    const ready = super.connect().then(async (client) => {
      if (this.applied.get(client) !== tenantId) {
        try {
          await client.query('SELECT set_config($1, $2, false)', [
            TENANT_SETTING,
            tenantId,
          ]);
        } catch (error) {
          client.release(error as Error);
          throw error;
        }
        this.applied.set(client, tenantId);
      }
      return client;
    });
    if (!callback) return ready;
    ready.then(
      (client) =>
        callback(undefined, client, (release) =>
          client.release(release as Error | boolean | undefined),
        ),
      (error: Error) => callback(error),
    );
  }
}

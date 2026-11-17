import { TenantContext } from './tenant-context';
import { separateBatchesByTenant } from './tenant-batching';

describe('separateBatchesByTenant', () => {
  const fakeClient = () => {
    const seen: (string | undefined)[] = [];
    const options = {
      batchBy: (request: object) =>
        (request as { batchable: boolean }).batchable
          ? 'Customer(id)'
          : undefined,
      singleLoader: (request: object) => {
        seen.push(TenantContext.get());
        return Promise.resolve(request);
      },
      batchLoader: (requests: object[]) => {
        seen.push(TenantContext.get());
        return Promise.resolve(requests);
      },
    };
    return {
      client: { _requestHandler: { dataloader: { options } } },
      options,
      seen,
    };
  };

  it('gives each tenant its own batch', async () => {
    const { client, options } = fakeClient();
    separateBatchesByTenant(client);
    const keyOf = () => options.batchBy({ batchable: true });

    const a = await TenantContext.run('a', () => Promise.resolve(keyOf()));
    const b = await TenantContext.run('b', () => Promise.resolve(keyOf()));
    const platform = await TenantContext.runAsPlatform(() =>
      Promise.resolve(keyOf()),
    );

    expect(new Set([a, b, platform, keyOf()]).size).toBe(4);
    expect(a).toBe('Customer(id)|tenant:a');
  });

  it('dispatches each batch with the tenant of whoever asked for it', async () => {
    const { client, options, seen } = fakeClient();
    separateBatchesByTenant(client);
    const [fromA, fromB] = [{ batchable: true }, { batchable: true }];
    await TenantContext.run('a', () => Promise.resolve(options.batchBy(fromA)));
    await TenantContext.run('b', () => Promise.resolve(options.batchBy(fromB)));

    // Prisma despacha fuera de esos contextos (desde un process.nextTick).
    await options.singleLoader(fromB);
    await options.batchLoader([fromA, fromA]);

    expect(seen).toEqual(['b', 'a']);
  });

  it('leaves queries that are not batched alone', () => {
    const { client, options } = fakeClient();
    separateBatchesByTenant(client);
    expect(options.batchBy({ batchable: false })).toBeUndefined();
  });

  it('fails if Prisma no longer exposes its batching', () => {
    expect(() => separateBatchesByTenant({})).toThrow('Prisma cambió');
  });
});

import { ensureTenantRls, tenantRlsStatements } from './tenant-rls';

describe('tenantRlsStatements', () => {
  it('enables row security and recreates the policy of each table', () => {
    const [enable, drop, create] = tenantRlsStatements(['sale_orders']);
    expect(enable).toBe('ALTER TABLE "sale_orders" ENABLE ROW LEVEL SECURITY');
    expect(drop).toBe(
      'DROP POLICY IF EXISTS "tenant_isolation" ON "sale_orders"',
    );
    expect(create).toContain(
      'CREATE POLICY "tenant_isolation" ON "sale_orders"',
    );
  });

  it('lets a row through for its tenant or in platform mode, reading and writing', () => {
    const [, , create] = tenantRlsStatements(['sale_orders']);
    const visible = `("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.all_tenants', true) = 'on')`;
    expect(create).toBe(
      `CREATE POLICY "tenant_isolation" ON "sale_orders" USING ${visible} WITH CHECK ${visible}`,
    );
  });

  it('quotes table names', () => {
    expect(tenantRlsStatements(['a"b'])[0]).toBe(
      'ALTER TABLE "a""b" ENABLE ROW LEVEL SECURITY',
    );
  });
});

describe('ensureTenantRls', () => {
  it('applies everything in one transaction and rolls back on failure', async () => {
    const sent: string[] = [];
    const owner = {
      query: jest.fn((sql: string) => {
        sent.push(sql);
        if (
          sql.startsWith('SELECT c.table_name') ||
          sql.includes('table_name AS name')
        ) {
          return Promise.resolve({ rows: [{ name: 'customers' }] });
        }
        if (sql.startsWith('CREATE POLICY')) {
          return Promise.reject(new Error('boom'));
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    await expect(ensureTenantRls(owner as never)).rejects.toThrow('boom');
    expect(sent.filter((sql) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql))).toEqual(
      ['BEGIN', 'ROLLBACK'],
    );
  });
});

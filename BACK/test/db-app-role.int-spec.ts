import { Client } from 'pg';

// Solo tiene sentido cuando hay un dueño separado (CI lo define siempre).
const describeWithAppRole = process.env.MIGRATE_DATABASE_URL
  ? describe
  : describe.skip;

describeWithAppRole('usuario de la base con el que se conecta la app', () => {
  const app = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(() => app.connect());
  afterAll(() => app.end());

  it('has no administrative attribute', async () => {
    const { rows } = await app.query<Record<string, boolean>>(
      `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
       FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows).toEqual([
      {
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
      },
    ]);
  });

  it('cannot create tables', async () => {
    await expect(
      app.query('CREATE TABLE app_role_probe (id int)'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('can read and write every table except the migrations one', async () => {
    const { rows } = await app.query<{ table: string; missing: string[] }>(
      `SELECT c.relname AS table,
              array_remove(ARRAY[
                CASE WHEN NOT has_table_privilege(c.oid, 'SELECT') THEN 'SELECT' END,
                CASE WHEN NOT has_table_privilege(c.oid, 'INSERT') THEN 'INSERT' END,
                CASE WHEN NOT has_table_privilege(c.oid, 'UPDATE') THEN 'UPDATE' END,
                CASE WHEN NOT has_table_privilege(c.oid, 'DELETE') THEN 'DELETE' END
              ], NULL) AS missing
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
         AND c.relname <> '_prisma_migrations'`,
    );
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.filter((r) => r.missing.length > 0)).toEqual([]);
  });

  it('cannot touch the migrations history', async () => {
    const { rows } = await app.query<{ any: boolean }>(
      `SELECT COALESCE(has_table_privilege(to_regclass('public._prisma_migrations'),
                'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'), false) AS any`,
    );
    expect(rows[0].any).toBe(false);
  });
});

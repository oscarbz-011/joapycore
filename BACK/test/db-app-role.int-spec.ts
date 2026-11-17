import { Client } from 'pg';
import { appRoleTarget, ensureAppRole } from '../src/prisma/app-role';

// Solo tiene sentido cuando hay un dueño separado (CI lo define siempre).
const describeWithAppRole = process.env.MIGRATE_DATABASE_URL
  ? describe
  : describe.skip;

describeWithAppRole('usuario de la base con el que se conecta la app', () => {
  const app = new Client({ connectionString: process.env.DATABASE_URL });
  const owner = new Client({
    connectionString: process.env.MIGRATE_DATABASE_URL,
  });
  const target = appRoleTarget(process.env.DATABASE_URL ?? '');

  beforeAll(() => Promise.all([app.connect(), owner.connect()]));
  afterAll(() => Promise.all([app.end(), owner.end()]));

  const migrationsAccess = async () =>
    (
      await app.query<{ any: boolean }>(
        `SELECT has_table_privilege('public._prisma_migrations',
                  'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') AS any`,
      )
    ).rows[0].any;

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
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.missing.length > 0)).toEqual([]);
  });

  // Una tabla de migraciones creada después del script nace con permisos por
  // los privilegios por defecto: correr el script otra vez se los quita.
  it('loses access to the migrations history when the script runs again', async () => {
    const { rows } = await owner.query<{ created: boolean }>(
      `SELECT to_regclass('public._prisma_migrations') IS NULL AS created`,
    );
    const created = rows[0].created;
    if (created) {
      await owner.query('CREATE TABLE "_prisma_migrations" (id text)');
      expect(await migrationsAccess()).toBe(true);
    }
    try {
      await ensureAppRole(owner, target);
      expect(await migrationsAccess()).toBe(false);
    } finally {
      if (created) await owner.query('DROP TABLE "_prisma_migrations"');
    }
  });

  it('leaves an existing role without inherited roles', async () => {
    const [{ owner: ownerRole }] = (
      await owner.query<{ owner: string }>('SELECT current_user AS owner')
    ).rows;
    await owner.query(`GRANT "${ownerRole}" TO "${target.role}"`);

    await ensureAppRole(owner, target);

    const { rows } = await owner.query(
      `SELECT 1 FROM pg_auth_members m JOIN pg_roles u ON u.oid = m.member
       WHERE u.rolname = $1`,
      [target.role],
    );
    expect(rows).toEqual([]);
  });
});

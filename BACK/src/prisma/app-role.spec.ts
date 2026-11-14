import {
  appRoleStatements,
  appRoleTarget,
  ensureAppRole,
  Queryable,
} from './app-role';

const target = { role: 'joapycore_app', password: 'secret', database: 'erp' };
const state = {
  owner: 'joapycore',
  roleExists: false,
  hasMigrationsTable: true,
};

describe('appRoleTarget', () => {
  it('reads user, password and database from the app URL', () => {
    expect(
      appRoleTarget(
        'postgresql://app%40x:p%23ss@localhost:5432/erp?schema=public',
      ),
    ).toEqual({ role: 'app@x', password: 'p#ss', database: 'erp' });
  });

  it('rejects a URL without password', () => {
    expect(() => appRoleTarget('postgresql://app@localhost/erp')).toThrow(
      /usuario, contraseña y base de datos/,
    );
  });
});

describe('appRoleStatements', () => {
  it('creates a role without any administrative attribute', () => {
    const [create] = appRoleStatements(target, state);
    expect(create).toMatch(/^CREATE ROLE "joapycore_app" WITH LOGIN/);
    for (const attr of [
      'NOSUPERUSER',
      'NOBYPASSRLS',
      'NOCREATEDB',
      'NOCREATEROLE',
      'NOREPLICATION',
    ]) {
      expect(create).toContain(attr);
    }
  });

  it('alters an existing role instead of creating it', () => {
    const [alter] = appRoleStatements(target, { ...state, roleExists: true });
    expect(alter).toMatch(/^ALTER ROLE "joapycore_app" WITH LOGIN NOSUPERUSER/);
  });

  it('grants data access only, now and for tables created later', () => {
    const sql = appRoleStatements(target, state).join('\n');
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "joapycore_app"',
    );
    expect(sql).toContain(
      'ALTER DEFAULT PRIVILEGES FOR ROLE "joapycore" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "joapycore_app"',
    );
    expect(sql).not.toMatch(/TRUNCATE|CREATE ON|ALL PRIVILEGES/);
  });

  it('keeps the migrations table away from the app when it exists', () => {
    expect(appRoleStatements(target, state).at(-1)).toBe(
      'REVOKE ALL ON TABLE public."_prisma_migrations" FROM "joapycore_app"',
    );
    expect(
      appRoleStatements(target, { ...state, hasMigrationsTable: false }).join(),
    ).not.toContain('_prisma_migrations');
  });

  it('escapes identifiers and the password', () => {
    const sql = appRoleStatements(
      { role: 'a"b', password: "it's", database: 'x"y' },
      state,
    ).join('\n');
    expect(sql).toContain('ROLE "a""b"');
    expect(sql).toContain("PASSWORD 'it''s'");
    expect(sql).toContain('DATABASE "x""y"');
  });

  it('refuses to strip the privileges of the owner itself', () => {
    expect(() =>
      appRoleStatements({ ...target, role: 'joapycore' }, state),
    ).toThrow(/su propio usuario/);
  });
});

describe('ensureAppRole', () => {
  function owner(failOn?: string) {
    const sql: string[] = [];
    const query = jest.fn((text: string) => {
      sql.push(text);
      if (failOn && text.startsWith(failOn)) throw new Error('denied');
      if (text === 'SELECT current_user') {
        return Promise.resolve({ rows: [{ current_user: 'joapycore' }] });
      }
      if (text.includes('pg_roles')) {
        return Promise.resolve({
          rows: [{ role_exists: true, has_migrations_table: false }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    return { query: query as unknown as Queryable['query'], sql };
  }

  it('applies every statement in one transaction', async () => {
    const db = owner();
    await ensureAppRole(db, target);
    expect(db.sql[2]).toBe('BEGIN');
    expect(db.sql[3]).toMatch(/^ALTER ROLE/);
    expect(db.sql.at(-1)).toBe('COMMIT');
  });

  it('rolls back when a statement fails', async () => {
    const db = owner('GRANT USAGE');
    await expect(ensureAppRole(db, target)).rejects.toThrow('denied');
    expect(db.sql.at(-1)).toBe('ROLLBACK');
    expect(db.sql).not.toContain('COMMIT');
  });
});

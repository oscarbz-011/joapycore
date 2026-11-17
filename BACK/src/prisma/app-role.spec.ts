import {
  appRoleStatements,
  appRoleTarget,
  ensureAppRole,
  Queryable,
} from './app-role';

const target = { role: 'joapycore_app', password: 'secret', database: 'erp' };
const state = {
  owner: 'joapycore',
  database: 'erp',
  roleExists: false,
  memberOf: [],
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

  it('removes inherited roles and earlier grants before granting', () => {
    const sql = appRoleStatements(target, {
      ...state,
      roleExists: true,
      memberOf: ['joapycore', 'pg_write_all_data'],
    });
    const firstGrant = sql.findIndex((s) => s.startsWith('GRANT'));
    expect(sql.slice(1, firstGrant)).toEqual(
      expect.arrayContaining([
        'REVOKE "joapycore" FROM "joapycore_app"',
        'REVOKE "pg_write_all_data" FROM "joapycore_app"',
        'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "joapycore_app"',
        'REVOKE ALL ON SCHEMA public FROM "joapycore_app"',
      ]),
    );
  });

  it('grants data access only, now and for tables created later', () => {
    const sql = appRoleStatements(target, state).join('\n');
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "joapycore_app"',
    );
    expect(sql).toContain(
      'ALTER DEFAULT PRIVILEGES FOR ROLE "joapycore" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "joapycore_app"',
    );
    expect(sql).not.toMatch(/GRANT[^\n]*(TRUNCATE|CREATE|ALL PRIVILEGES)/);
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
      { ...state, database: 'x"y', memberOf: ['c"d'] },
    ).join('\n');
    expect(sql).toContain('ROLE "a""b"');
    expect(sql).toContain("PASSWORD 'it''s'");
    expect(sql).toContain('DATABASE "x""y"');
    expect(sql).toContain('REVOKE "c""d" FROM "a""b"');
  });

  it('refuses to strip the privileges of the owner itself', () => {
    expect(() =>
      appRoleStatements({ ...target, role: 'joapycore' }, state),
    ).toThrow(/su propio usuario/);
  });

  it('refuses when both URLs point to different databases', () => {
    expect(() =>
      appRoleStatements(target, { ...state, database: 'other' }),
    ).toThrow(/"erp".*"other"/);
  });
});

describe('ensureAppRole', () => {
  function owner({
    failOn,
    canCreate = false,
  }: { failOn?: string; canCreate?: boolean } = {}) {
    const sql: string[] = [];
    const query = jest.fn((text: string) => {
      sql.push(text);
      if (failOn && text.startsWith(failOn)) throw new Error('denied');
      if (text.includes('current_database()')) {
        return Promise.resolve({ rows: [{ ...state, roleExists: true }] });
      }
      if (text.includes('has_schema_privilege')) {
        return Promise.resolve({ rows: [{ canCreate }] });
      }
      return Promise.resolve({ rows: [] });
    });
    return { query: query as unknown as Queryable['query'], sql };
  }

  it('applies every statement in one transaction', async () => {
    const db = owner();
    await ensureAppRole(db, target);
    expect(db.sql[1]).toBe('BEGIN');
    expect(db.sql[2]).toMatch(/^ALTER ROLE/);
    expect(db.sql).toContain('COMMIT');
  });

  it('rolls back when a statement fails', async () => {
    const db = owner({ failOn: 'GRANT USAGE' });
    await expect(ensureAppRole(db, target)).rejects.toThrow('denied');
    expect(db.sql.at(-1)).toBe('ROLLBACK');
    expect(db.sql).not.toContain('COMMIT');
  });

  it('fails when the app can still create tables through PUBLIC', async () => {
    await expect(
      ensureAppRole(owner({ canCreate: true }), target),
    ).rejects.toThrow(/REVOKE CREATE ON SCHEMA public FROM PUBLIC/);
  });
});

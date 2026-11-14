import { escapeIdentifier, escapeLiteral } from 'pg';

export interface AppRoleTarget {
  role: string;
  password: string;
  database: string;
}

export interface AppRoleState {
  owner: string;
  roleExists: boolean;
  hasMigrationsTable: boolean;
}

export interface Queryable {
  query<R extends object>(
    sql: string,
    params?: unknown[],
  ): Promise<{
    rows: R[];
  }>;
}

const DATA = 'SELECT, INSERT, UPDATE, DELETE';
const SEQUENCES = 'USAGE, SELECT, UPDATE';
const ATTRIBUTES =
  'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION';

export function appRoleTarget(appUrl: string): AppRoleTarget {
  const url = new URL(appUrl);
  const target = {
    role: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
  if (!target.role || !target.password || !target.database) {
    throw new Error(
      'DATABASE_URL debe incluir usuario, contraseña y base de datos',
    );
  }
  return target;
}

export function appRoleStatements(
  target: AppRoleTarget,
  state: AppRoleState,
): string[] {
  if (target.role === state.owner) {
    throw new Error(
      `DATABASE_URL usa el mismo usuario que MIGRATE_DATABASE_URL (${state.owner}): la app necesita su propio usuario`,
    );
  }
  const role = escapeIdentifier(target.role);
  const owner = escapeIdentifier(state.owner);
  const password = escapeLiteral(target.password);

  return [
    state.roleExists
      ? `ALTER ROLE ${role} WITH ${ATTRIBUTES} PASSWORD ${password}`
      : `CREATE ROLE ${role} WITH ${ATTRIBUTES} PASSWORD ${password}`,
    `GRANT CONNECT ON DATABASE ${escapeIdentifier(target.database)} TO ${role}`,
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    `GRANT ${DATA} ON ALL TABLES IN SCHEMA public TO ${role}`,
    `GRANT ${SEQUENCES} ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    // Las tablas que creen las migraciones futuras nacen con permisos.
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT ${DATA} ON TABLES TO ${role}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT ${SEQUENCES} ON SEQUENCES TO ${role}`,
    ...(state.hasMigrationsTable
      ? [`REVOKE ALL ON TABLE public."_prisma_migrations" FROM ${role}`]
      : []),
  ];
}

/** Crea o actualiza el usuario de la app. `owner` es una conexión del dueño de las tablas. */
export async function ensureAppRole(
  owner: Queryable,
  target: AppRoleTarget,
): Promise<void> {
  const [{ current_user }] = (
    await owner.query<{ current_user: string }>('SELECT current_user')
  ).rows;
  const [{ role_exists, has_migrations_table }] = (
    await owner.query<{
      role_exists: boolean;
      has_migrations_table: boolean;
    }>(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS role_exists,
              to_regclass('public._prisma_migrations') IS NOT NULL AS has_migrations_table`,
      [target.role],
    )
  ).rows;

  const statements = appRoleStatements(target, {
    owner: current_user,
    roleExists: role_exists,
    hasMigrationsTable: has_migrations_table,
  });

  await owner.query('BEGIN');
  try {
    for (const sql of statements) await owner.query(sql);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

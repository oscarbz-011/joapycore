import { escapeIdentifier, escapeLiteral } from 'pg';

export interface AppRoleTarget {
  role: string;
  password: string;
  database: string;
}

export interface AppRoleState {
  owner: string;
  database: string;
  roleExists: boolean;
  memberOf: string[];
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
  if (target.database !== state.database) {
    throw new Error(
      `DATABASE_URL apunta a la base "${target.database}" y MIGRATE_DATABASE_URL a "${state.database}"`,
    );
  }
  const role = escapeIdentifier(target.role);
  const owner = escapeIdentifier(state.owner);
  const password = escapeLiteral(target.password);

  return [
    state.roleExists
      ? `ALTER ROLE ${role} WITH ${ATTRIBUTES} PASSWORD ${password}`
      : `CREATE ROLE ${role} WITH ${ATTRIBUTES} PASSWORD ${password}`,
    // Un usuario que ya existía termina igual que uno nuevo: sin roles
    // heredados ni permisos de antes.
    ...state.memberOf.map(
      (granted) => `REVOKE ${escapeIdentifier(granted)} FROM ${role}`,
    ),
    `REVOKE ALL ON DATABASE ${escapeIdentifier(state.database)} FROM ${role}`,
    `REVOKE ALL ON SCHEMA public FROM ${role}`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON TABLES FROM ${role}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${role}`,
    `GRANT CONNECT ON DATABASE ${escapeIdentifier(state.database)} TO ${role}`,
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
  const [found] = (
    await owner.query<{
      owner: string;
      database: string;
      roleExists: boolean;
      memberOf: string[];
      hasMigrationsTable: boolean;
    }>(
      `SELECT current_user AS owner,
              current_database() AS database,
              EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS "roleExists",
              ARRAY(SELECT g.rolname::text FROM pg_auth_members m
                    JOIN pg_roles g ON g.oid = m.roleid
                    JOIN pg_roles u ON u.oid = m.member
                    WHERE u.rolname = $1) AS "memberOf",
              to_regclass('public._prisma_migrations') IS NOT NULL AS "hasMigrationsTable"`,
      [target.role],
    )
  ).rows;

  const statements = appRoleStatements(target, found);

  await owner.query('BEGIN');
  try {
    for (const sql of statements) await owner.query(sql);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }

  // Hasta PostgreSQL 14, PUBLIC puede crear tablas en public y eso no se le
  // puede quitar a un solo usuario.
  const [{ canCreate }] = (
    await owner.query<{ canCreate: boolean }>(
      `SELECT has_schema_privilege($1, 'public', 'CREATE') AS "canCreate"`,
      [target.role],
    )
  ).rows;
  if (canCreate) {
    throw new Error(
      `"${target.role}" todavía puede crear tablas en public: como administrador, correr REVOKE CREATE ON SCHEMA public FROM PUBLIC`,
    );
  }
}

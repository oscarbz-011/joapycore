import { escapeIdentifier } from 'pg';
import type { Queryable } from './app-role';
import { ALL_TENANTS_SETTING, TENANT_SETTING } from './tenant-pool';

export const TENANT_COLUMN = 'tenant_id';
export const TENANT_POLICY = 'tenant_isolation';

// Visible si es de la empresa del contexto, o en modo plataforma. El dueño de
// las tablas no queda sujeto (sin FORCE): migraciones y scripts ven todo.
const VISIBLE = `(${escapeIdentifier(TENANT_COLUMN)} = current_setting('${TENANT_SETTING}', true) OR current_setting('${ALL_TENANTS_SETTING}', true) = 'on')`;

export function tenantRlsStatements(tables: string[]): string[] {
  return tables.flatMap((table) => {
    const name = escapeIdentifier(table);
    const policy = escapeIdentifier(TENANT_POLICY);
    return [
      `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS ${policy} ON ${name}`,
      `CREATE POLICY ${policy} ON ${name} USING ${VISIBLE} WITH CHECK ${VISIBLE}`,
    ];
  });
}

const TENANT_TABLES = `
  SELECT c.table_name AS name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public' AND c.column_name = $1
    AND t.table_type = 'BASE TABLE'
  ORDER BY c.table_name`;

/** Activa la seguridad de filas en toda tabla con tenant_id. Idempotente. */
export async function ensureTenantRls(owner: Queryable): Promise<string[]> {
  const tables = (
    await owner.query<{ name: string }>(TENANT_TABLES, [TENANT_COLUMN])
  ).rows.map((row) => row.name);

  await owner.query('BEGIN');
  try {
    for (const sql of tenantRlsStatements(tables)) await owner.query(sql);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
  return tables;
}

/** Tablas con tenant_id sin seguridad de filas o sin la política. */
export async function unprotectedTenantTables(
  client: Queryable,
): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>(
    `SELECT t.name FROM (${TENANT_TABLES}) t
     JOIN pg_class c ON c.relname = t.name
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE NOT c.relrowsecurity
        OR NOT EXISTS (SELECT 1 FROM pg_policies p
                       WHERE p.schemaname = 'public' AND p.tablename = t.name
                         AND p.policyname = $2)`,
    [TENANT_COLUMN, TENANT_POLICY],
  );
  return rows.map((row) => row.name);
}

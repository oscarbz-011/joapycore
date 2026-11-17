import 'dotenv/config';
import { Client } from 'pg';
import { ensureTenantRls } from '../src/prisma/tenant-rls';

// Con el dueño de las tablas activa la seguridad de filas por empresa en toda
// tabla con tenant_id. Se corre después de cada migración, igual que db:app-role.
async function main() {
  const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('Falta MIGRATE_DATABASE_URL o DATABASE_URL');
  const owner = new Client({ connectionString: url });
  await owner.connect();
  try {
    const tables = await ensureTenantRls(owner);
    console.log(`Seguridad de filas activa en ${tables.length} tablas.`);
  } finally {
    await owner.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});

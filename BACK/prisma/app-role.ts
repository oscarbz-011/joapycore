import 'dotenv/config';
import { Client } from 'pg';
import { appRoleTarget, ensureAppRole } from '../src/prisma/app-role';

// Con MIGRATE_DATABASE_URL (dueño de las tablas) crea o actualiza el usuario
// de DATABASE_URL, que es con el que se conecta la app.
async function main() {
  const ownerUrl = process.env.MIGRATE_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;
  if (!ownerUrl || !appUrl) {
    throw new Error('Faltan MIGRATE_DATABASE_URL o DATABASE_URL');
  }

  const target = appRoleTarget(appUrl);
  const owner = new Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    await ensureAppRole(owner, target);
  } finally {
    await owner.end();
  }
  console.log(
    `Usuario "${target.role}" listo en la base "${target.database}".`,
  );
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});

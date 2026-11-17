import 'dotenv/config';
import { demoPassword } from '../../src/prisma/demo-password';
import { createPrisma } from './helpers';
import { seedElectrodomesticos } from './electrodomesticos.seed';
import { seedFerreteria } from './ferreteria.seed';
import { seedSupermercado } from './supermercado.seed';
import { seedServicios } from './servicios.seed';
import { seedDefault } from './default.seed';

// Datos de prueba para los 5 rubros de MODULE_TEMPLATES — corre a mano
// (pnpm seed:demo), separado de `prisma db seed` (que solo siembra el
// catálogo de permisos, ver prisma/seed.ts). No se ejecuta automáticamente
// en `prisma migrate dev`.
async function main() {
  demoPassword(process.env);
  const prisma = createPrisma();

  const seeders = [
    seedElectrodomesticos,
    seedFerreteria,
    seedSupermercado,
    seedServicios,
    seedDefault,
  ];

  const results: { industry: string; ownerEmail: string; skipped: boolean }[] =
    [];
  for (const seeder of seeders) {
    const result = await seeder(prisma);
    results.push(result);
    console.log(
      result.skipped
        ? `⏭  ${result.industry}: ya sembrado, omitido (${result.ownerEmail})`
        : `✅ ${result.industry}: tenant creado (${result.ownerEmail})`,
    );
  }

  console.log('\nResumen:');
  console.log(
    'Todos los owners de demo entran con la clave de DEMO_PASSWORD.\n',
  );
  for (const r of results) {
    console.log(
      `  ${r.industry.padEnd(16)} ${r.ownerEmail}${r.skipped ? '  (ya existía)' : ''}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

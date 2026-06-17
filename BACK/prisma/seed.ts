import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../src/common/constants/permissions.constant';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key },
      update: {},
    });
  }

  console.log(`Seeded ${PERMISSIONS.length} permissions.`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

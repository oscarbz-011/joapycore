import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../src/common/constants/permissions.constant';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // 1. Upsert permission catalog
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key },
      update: {},
    });
  }
  console.log(`Seeded ${PERMISSIONS.length} permissions.`);

  // 2. Grant all permissions to every system (Owner) role.
  //    This ensures that newly added permissions are automatically
  //    available to existing Owner roles without manual DB changes.
  const allPermissions = await prisma.permission.findMany();
  const systemRoles = await prisma.role.findMany({ where: { isSystem: true } });

  for (const role of systemRoles) {
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const existingIds = new Set(existing.map((r) => r.permissionId));
    const missing = allPermissions.filter((p) => !existingIds.has(p.id));

    if (missing.length > 0) {
      await prisma.rolePermission.createMany({
        data: missing.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
      console.log(
        `Granted ${missing.length} missing permission(s) to role "${role.name}" (tenant: ${role.tenantId})`,
      );
    }
  }

  if (systemRoles.length === 0) {
    console.log('No system roles found — skipping role backfill.');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * One-time script: attaches all catalog permissions to every system (Owner) role
 * that doesn't already have them. Run after adding new permissions to seed.
 *
 * Usage: npx ts-node prisma/fix-owner-permissions.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const allPermissions = await prisma.permission.findMany();
  const systemRoles = await prisma.role.findMany({
    where: { isSystem: true },
    include: { rolePermissions: true },
  });

  console.log(`Found ${systemRoles.length} system role(s), ${allPermissions.length} permissions`);

  for (const role of systemRoles) {
    const existingIds = new Set(systemRoles[0].rolePermissions.map((rp) => rp.permissionId));
    const missing = allPermissions.filter((p) => !existingIds.has(p.id));

    if (missing.length === 0) {
      console.log(`  Role "${role.name}" (${role.tenantId}): already up to date`);
      continue;
    }

    await prisma.rolePermission.createMany({
      data: missing.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    console.log(`  Role "${role.name}" (${role.tenantId}): attached ${missing.length} missing permission(s)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

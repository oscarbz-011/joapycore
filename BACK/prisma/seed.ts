import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../src/common/constants/permissions.constant';
import { ALL_TENANT_MODULES } from '../src/common/constants/modules.constant';

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

  // 3. Backfill any newly added modules to ALL existing tenants (inactive by default).
  //    This ensures tenants created before a new module was added see it in their catalog.
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    const existingModules = await prisma.tenantModule.findMany({
      where: { tenantId: tenant.id },
      select: { moduleName: true },
    });
    const existingNames = new Set(existingModules.map((m) => m.moduleName));
    const missingModules = ALL_TENANT_MODULES.filter(
      (name) => !existingNames.has(name),
    );

    if (missingModules.length > 0) {
      await prisma.tenantModule.createMany({
        data: missingModules.map((moduleName) => ({
          tenantId: tenant.id,
          moduleName,
          active: false,
        })),
        skipDuplicates: true,
      });
      console.log(
        `Backfilled ${missingModules.length} new module(s) for tenant ${tenant.id}: ${missingModules.join(', ')}`,
      );
    }
  }

  if (tenants.length === 0) {
    console.log('No tenants found — module backfill skipped.');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  ALL_TENANT_MODULES,
  MODULE_TEMPLATES,
} from '../../src/common/constants/modules.constant';

const SALT_ROUNDS = 10;
const OWNER_ROLE_NAME = 'Owner';

// Compartida por todos los tenants de demo — solo para desarrollo local,
// nunca para producción (mismo criterio que las cuentas QA usadas en toda
// la sesión de verificación de este proyecto).
export const DEMO_PASSWORD = 'Demo1234!';

export function createPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export interface DemoTenantInput {
  name: string;
  industry: string;
  ownerEmail: string;
  ownerFirstName?: string;
  ownerLastName?: string;
  razonSocial?: string;
  ruc?: string;
  city?: string;
  phone?: string;
}

// Idempotencia: si ya existe un usuario con este email de owner, el tenant
// ya fue sembrado antes — se devuelve su tenantId para que el script que
// llama decida omitir en vez de duplicar.
export async function findExistingDemoTenantId(
  prisma: PrismaClient,
  ownerEmail: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email: ownerEmail },
    select: { tenantId: true },
  });
  return user?.tenantId ?? null;
}

// Mismo shape mínimo que AuthService.register(): Tenant + rol Owner
// (isSystem, sin RolePermission propias — un rol isSystem recibe todos los
// permisos del catálogo al loguearse, ver AuthService.issueTokens) + User +
// sucursal "Casa Matriz" + depósito "Depósito Principal" + TenantModule[]
// activados según MODULE_TEMPLATES[industry] (mismo criterio que
// TenantModulesRepository.seedDefaults).
export async function createDemoTenant(
  prisma: PrismaClient,
  input: DemoTenantInput,
) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  const activeModules =
    MODULE_TEMPLATES[input.industry] ?? MODULE_TEMPLATES.default;

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name,
        industry: input.industry,
        razonSocial: input.razonSocial ?? input.name,
        ruc: input.ruc,
        city: input.city ?? 'Asunción',
        phone: input.phone,
      },
    });

    const ownerRole = await tx.role.create({
      data: { tenantId: tenant.id, name: OWNER_ROLE_NAME, isSystem: true },
    });

    // El JWT ya le da todos los permisos a un rol isSystem al loguearse
    // (AuthService.issueTokens), sin necesidad de RolePermission — pero la
    // pantalla de Roles y Permisos (`GET /roles`) sí lee de esa tabla para
    // mostrar los checks. Sin esto, el Owner de un tenant sembrado se ve ahí
    // como "sin permisos" aunque funcionalmente tenga todos — mismo
    // criterio que AuthService.register() ya usa para tenants reales.
    const allPermissions = await tx.permission.findMany();
    if (allPermissions.length > 0) {
      await tx.rolePermission.createMany({
        data: allPermissions.map((p) => ({
          roleId: ownerRole.id,
          permissionId: p.id,
        })),
        skipDuplicates: true,
      });
    }

    const owner = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: input.ownerEmail,
        passwordHash,
        firstName: input.ownerFirstName ?? 'Demo',
        lastName: input.ownerLastName ?? 'Owner',
      },
    });
    await tx.userRole.create({
      data: { userId: owner.id, roleId: ownerRole.id },
    });

    const branch = await tx.branch.create({
      data: { tenantId: tenant.id, name: 'Casa Matriz', isMain: true },
    });
    const warehouse = await tx.warehouse.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        name: 'Depósito Principal',
        isDefault: true,
      },
    });

    await tx.tenantModule.createMany({
      data: ALL_TENANT_MODULES.map((moduleName) => ({
        tenantId: tenant.id,
        moduleName,
        active: activeModules.includes(moduleName),
        activatedAt: activeModules.includes(moduleName) ? new Date() : null,
      })),
    });

    return { tenant, owner, branch, warehouse };
  });
}

// Mismo formato que CustomersService.generateCustomerCode() — CLI-YY-NNNNNN,
// secuencial por tenant. En un tenant recién sembrado siempre arranca en 1.
export function customerCode(seq: number): string {
  const year = String(new Date().getFullYear()).slice(-2);
  return `CLI-${year}-${String(seq).padStart(6, '0')}`;
}

// Mismo formato que EmployeesService.generateEmployeeCode() —
// EMP-BB-NNNNNN, donde BB es la posición 1-indexada de la sucursal entre
// las del tenant (ordenadas por createdAt). Cada tenant de demo tiene una
// sola sucursal (Casa Matriz), así que siempre es "01".
export function employeeCode(employeeNumber: number, branchIndex = 1): string {
  return `EMP-${String(branchIndex).padStart(2, '0')}-${String(employeeNumber).padStart(6, '0')}`;
}

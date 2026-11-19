/**
 * Integración contra PostgreSQL real: RRHH crea y desactiva la cuenta de
 * usuario del empleado por el contrato USER_ACCOUNTS, dentro de la misma
 * transacción del alta y la baja.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { EventBus } from '../src/common/events/event-bus';
import { EmployeesRepository } from '../src/modules/hr/repositories/employees.repository';
import { HrSourcesRepository } from '../src/modules/hr/repositories/hr-sources.repository';
import { PositionsRepository } from '../src/modules/hr/repositories/positions.repository';
import { EmployeesService } from '../src/modules/hr/services/employees.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersRepository } from '../src/users/repositories/users.repository';
import { UserAccountsService } from '../src/users/services/user-accounts.service';

describe('EmployeesService + USER_ACCOUNTS (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: EmployeesService;
  let tenantId: string;
  let roleId: string;
  let positionId: string;

  const dto = (documentNumber: string, email?: string) => ({
    firstName: 'ana',
    lastName: 'lópez',
    documentType: 'CI' as const,
    documentNumber,
    birthDate: '1990-05-15',
    hireDate: '2023-01-10',
    baseSalary: 2_500_000,
    positionId,
    ...(email && { email }),
  });

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    const tenant = await prisma.tenant.create({
      data: { name: `TEST employee accounts ${randomUUID()}` },
      select: { id: true },
    });
    tenantId = tenant.id;
    roleId = (
      await prisma.role.create({
        data: { tenantId, name: 'Vendedor' },
        select: { id: true },
      })
    ).id;
    positionId = (
      await prisma.position.create({
        data: { tenantId, name: 'VENDEDOR', roleId },
        select: { id: true },
      })
    ).id;
    service = new EmployeesService(
      new EmployeesRepository(prisma),
      prisma,
      new EventBus(new EventEmitter2()),
      new UserAccountsService(new UsersRepository(prisma)),
      new PositionsRepository(prisma),
      new HrSourcesRepository(prisma),
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    if (tenantId) {
      await prisma.userRole.deleteMany({ where: { tenantId } });
      await prisma.employee.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.position.deleteMany({ where: { tenantId } });
      await prisma.role.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('creates the account with the position role and a temporary password', async () => {
    const email = `ana-${randomUUID()}@company.test`;

    const { employee, tempPassword } = await service.create(
      tenantId,
      dto(randomUUID(), email),
    );

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { userRoles: true },
    });
    expect(employee.userId).toBe(user.id);
    expect(tempPassword).toBeTruthy();
    expect(user).toMatchObject({
      tenantId,
      firstName: 'Ana',
      lastName: 'López',
      mustChangePassword: true,
    });
    expect(user.userRoles.map((r) => r.roleId)).toEqual([roleId]);
  });

  it('leaves no account behind when the employee insert fails', async () => {
    const documentNumber = randomUUID();
    await service.create(tenantId, dto(documentNumber));
    const email = `dup-${randomUUID()}@company.test`;

    await expect(
      service.create(tenantId, dto(documentNumber, email)),
    ).rejects.toThrow();

    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('rejects an email that is already in use', async () => {
    const email = `taken-${randomUUID()}@company.test`;
    await service.create(tenantId, dto(randomUUID(), email));

    await expect(
      service.create(tenantId, dto(randomUUID(), email)),
    ).rejects.toThrow('El email ya está en uso');
  });

  it('never touches a user of another company', async () => {
    const other = await prisma.tenant.create({
      data: { name: `TEST other company ${randomUUID()}` },
      select: { id: true },
    });
    const accounts = new UserAccountsService(new UsersRepository(prisma));
    try {
      const outsider = await prisma.user.create({
        data: {
          tenantId: other.id,
          email: `outsider-${randomUUID()}@company.test`,
          passwordHash: 'unchanged',
          firstName: 'Otra',
          lastName: 'Empresa',
        },
      });

      await accounts.setBranch(tenantId, outsider.id, null);
      await accounts.resetTempPassword(tenantId, outsider.id);
      await prisma.$transaction((tx) =>
        accounts.deactivate(tx, tenantId, outsider.id),
      );

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: outsider.id },
      });
      expect(after).toMatchObject({
        status: outsider.status,
        passwordHash: 'unchanged',
        mustChangePassword: outsider.mustChangePassword,
        sessionsValidAfter: outsider.sessionsValidAfter,
      });
    } finally {
      await prisma.user.deleteMany({ where: { tenantId: other.id } });
      await prisma.tenant.deleteMany({ where: { id: other.id } });
    }
  });

  it('deactivates the account when the employee is terminated', async () => {
    const email = `term-${randomUUID()}@company.test`;
    const { employee } = await service.create(
      tenantId,
      dto(randomUUID(), email),
    );

    await service.terminate(tenantId, employee.id);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.status).toBe('INACTIVE');
    expect(user.sessionsValidAfter).not.toBeNull();
  });
});

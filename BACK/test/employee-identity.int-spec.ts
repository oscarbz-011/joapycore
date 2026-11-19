import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { EventBus } from '../src/common/events/event-bus';
import { buildUsernameBase } from '../src/common/utils/username.util';
import { EmployeeAccountsRepository } from '../src/modules/hr/repositories/employee-accounts.repository';
import { EmployeesRepository } from '../src/modules/hr/repositories/employees.repository';
import { EmployeesService } from '../src/modules/hr/services/employees.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/prisma/tenant-context';
import { UsersRepository } from '../src/users/repositories/users.repository';

// Una empresa nunca ve ni deduce los usuarios de otra. El nombre de usuario es
// único en toda la plataforma, así que se elige uno libre sin decir de quién es
// el ocupado.
const describeAsApp = process.env.MIGRATE_DATABASE_URL
  ? describe
  : describe.skip;

describeAsApp('alta de empleado con datos de otra empresa (PostgreSQL)', () => {
  const prisma = new PrismaService(
    new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
  );
  const [tenantA, tenantB] = [randomUUID(), randomUUID()];
  const lastName = `Prueba${randomUUID()
    .replace(/[^a-z]/g, '')
    .slice(0, 8)}`;
  const usernameBase = buildUsernameBase('Luis', lastName);
  const service = new EmployeesService(
    new EmployeesRepository(prisma),
    prisma,
    new EventBus(new EventEmitter2()),
    new EmployeeAccountsRepository(prisma),
  );
  const asA = <T>(fn: () => Promise<T>) => TenantContext.run(tenantA, fn);
  const dto = (documentNumber: string, email: string) => ({
    firstName: 'Luis',
    lastName,
    documentType: 'CI' as const,
    documentNumber,
    birthDate: '1990-05-15',
    hireDate: '2023-01-10',
    baseSalary: 2_500_000,
    email,
  });
  let emailOfB: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: `TEST identity A ${tenantA}` },
        { id: tenantB, name: `TEST identity B ${tenantB}` },
      ],
    });
    emailOfB = `luis-${randomUUID()}@company.test`;
    await prisma.user.create({
      data: {
        tenantId: tenantB,
        email: emailOfB,
        username: usernameBase,
        passwordHash: 'x',
        firstName: 'Luis',
        lastName,
      },
    });
  });

  afterAll(async () => {
    const where = { tenantId: { in: [tenantA, tenantB] } };
    await prisma.employee.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
    await prisma.onModuleDestroy();
  });

  it('gives the account a free username when another company has the same one', async () => {
    const email = `luis-${randomUUID()}@company.test`;

    const { employee } = await asA(() =>
      service.create(tenantA, dto(randomUUID(), email)),
    );

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: employee.userId ?? '' },
    });
    expect(user.username).toBe(`${usernameBase}2`);
  });

  it('does not reveal that another company uses the email', async () => {
    const { employee } = await asA(() =>
      service.create(tenantA, { ...dto(randomUUID(), ''), email: undefined }),
    );

    await expect(
      asA(() => service.linkUser(tenantA, employee.id, emailOfB)),
    ).rejects.toThrow('Usuario no encontrado con ese email');
    // Lo frena la restricción única y responde el mensaje genérico del filtro.
    await expect(
      asA(() => service.create(tenantA, dto(randomUUID(), emailOfB))),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('names the employee who already has the document', async () => {
    const documentNumber = randomUUID();
    await asA(() =>
      service.create(
        tenantA,
        dto(documentNumber, `first-${randomUUID()}@company.test`),
      ),
    );

    await expect(
      asA(() =>
        service.create(
          tenantA,
          dto(documentNumber, `second-${randomUUID()}@company.test`),
        ),
      ),
    ).rejects.toThrow(
      `Ya hay un empleado con el documento CI ${documentNumber}: Luis ${lastName}`,
    );
  });

  it('keeps other companies out of sight on the Users screen', async () => {
    const users = new UsersRepository(prisma);

    const found = await asA(() => users.findByEmail(emailOfB));
    const username = await asA(() =>
      users.generateUniqueUsername('Luis', lastName),
    );

    expect(found).toBeNull();
    expect(username).not.toBe(usernameBase);
  });
});

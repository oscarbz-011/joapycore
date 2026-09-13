/**
 * Integración contra PostgreSQL real del flujo de vacaciones: saldo, reserva,
 * aprobación, cancelación y solicitudes concurrentes del mismo empleado.
 * Usa un año lejano (2099) para no pisar datos reales y borra lo que crea.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmployeesRepository } from '../src/modules/hr/repositories/employees.repository';
import { LeavesRepository } from '../src/modules/hr/repositories/leaves.repository';
import { LeavesService } from '../src/modules/hr/services/leaves.service';

const YEAR = 2099;

describe('LeavesService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: LeavesService;
  let tenantId: string;
  let employeeId: string;

  const cleanup = () =>
    Promise.all([
      prisma.leave.deleteMany({
        where: {
          employeeId,
          startDate: { gte: new Date(Date.UTC(YEAR, 0, 1)) },
        },
      }),
      prisma.leaveBalance.deleteMany({ where: { employeeId, year: YEAR } }),
    ]);

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    const employee = await prisma.employee.findFirstOrThrow({
      where: { isActive: true, terminationDate: null, deletedAt: null },
      select: { id: true, tenantId: true },
    });
    tenantId = employee.tenantId;
    employeeId = employee.id;
    service = new LeavesService(
      prisma,
      new LeavesRepository(prisma),
      new EmployeesRepository(prisma),
      new EventEmitter2(),
    );
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('reserves, approves and cancels keeping the balance consistent', async () => {
    await service.setEntitlement(tenantId, employeeId, {
      year: YEAR,
      entitled: 12,
    });

    // lunes 05/10/2099 a sábado 10/10/2099 = 6 días hábiles
    const leave = await service.request(tenantId, {
      employeeId,
      type: 'VACATION',
      startDate: `${YEAR}-10-05`,
      endDate: `${YEAR}-10-10`,
    });
    expect(leave.days).toBe(6);
    expect(await service.getBalance(tenantId, employeeId, YEAR)).toMatchObject({
      pending: 6,
      taken: 0,
      available: 6,
    });

    await expect(
      service.request(tenantId, {
        employeeId,
        type: 'SICK',
        startDate: `${YEAR}-10-09`,
        endDate: `${YEAR}-10-12`,
      }),
    ).rejects.toThrow('ya tiene una licencia');

    await service.approve(tenantId, leave.id);
    expect(await service.getBalance(tenantId, employeeId, YEAR)).toMatchObject({
      pending: 0,
      taken: 6,
      available: 6,
    });

    await service.cancel(tenantId, leave.id);
    expect(await service.getBalance(tenantId, employeeId, YEAR)).toMatchObject({
      pending: 0,
      taken: 0,
      available: 12,
    });
  });

  it('lets only one of two concurrent requests use the last days', async () => {
    await cleanup();
    await service.setEntitlement(tenantId, employeeId, {
      year: YEAR,
      entitled: 6,
    });

    const ask = (start: string, end: string) =>
      service.request(tenantId, {
        employeeId,
        type: 'VACATION',
        startDate: start,
        endDate: end,
      });
    // Semanas distintas (no se superponen), 6 días cada una; solo alcanza para una.
    const results = await Promise.allSettled([
      ask(`${YEAR}-11-02`, `${YEAR}-11-07`),
      ask(`${YEAR}-11-09`, `${YEAR}-11-14`),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await service.getBalance(tenantId, employeeId, YEAR)).toMatchObject({
      pending: 6,
      available: 0,
    });
  });
});

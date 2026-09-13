import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { businessDaysBetween, legalVacationDays } from './leave-calc';
import { balanceDelta, LeavesService } from './leaves.service';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('leave-calc', () => {
  it('counts Monday to Saturday, inclusive, skipping Sundays', () => {
    // 05/10/2026 es lunes; 11/10 domingo
    expect(businessDaysBetween(d('2026-10-05'), d('2026-10-11'))).toBe(6);
    expect(businessDaysBetween(d('2026-10-11'), d('2026-10-11'))).toBe(0);
    expect(businessDaysBetween(d('2026-10-05'), d('2026-10-16'))).toBe(11);
    expect(businessDaysBetween(d('2026-10-16'), d('2026-10-05'))).toBe(0);
  });

  it.each([
    ['2026-03-01', 2026, 0], // todavía no cumple 1 año
    ['2025-12-31', 2026, 12], // cumple 1 año el 31/12
    ['2021-06-01', 2026, 12], // 5 años
    ['2020-06-01', 2026, 18], // 6 años
    ['2016-06-01', 2026, 18], // 10 años
    ['2015-06-01', 2026, 30], // 11 años
  ])('hire %s → %i: %i días hábiles', (hire, year, expected) => {
    expect(legalVacationDays(d(hire), year)).toBe(expected);
  });
});

describe('balanceDelta', () => {
  it('moves pending to taken on approval and releases on reject/cancel', () => {
    expect(balanceDelta('PENDING', 'APPROVED', 5)).toEqual({
      pending: -5,
      taken: 5,
    });
    expect(balanceDelta('PENDING', 'REJECTED', 5)).toEqual({ pending: -5 });
    expect(balanceDelta('PENDING', 'CANCELLED', 5)).toEqual({ pending: -5 });
    expect(balanceDelta('APPROVED', 'CANCELLED', 5)).toEqual({ taken: -5 });
  });
});

describe('LeavesService', () => {
  const employee = {
    id: 'emp-1',
    tenantId: 't1',
    hireDate: d('2020-01-10'),
    isActive: true,
    terminationDate: null,
  };
  let repo: Record<string, jest.Mock>;
  let employees: { findById: jest.Mock; findByUserId: jest.Mock };
  let events: { emit: jest.Mock };
  let service: LeavesService;
  const tx = {};

  beforeEach(() => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      lockEmployee: jest.fn(),
      findOverlapping: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation((data: object) => ({ id: 'leave-1', ...data })),
      transition: jest.fn().mockResolvedValue(1),
      createBalanceIfMissing: jest.fn().mockResolvedValue({
        employeeId: 'emp-1',
        year: 2026,
        entitled: 18,
        taken: 5,
        pending: 3,
      }),
      setEntitlement: jest.fn(),
      adjustBalance: jest.fn(),
    };
    employees = {
      findById: jest.fn().mockResolvedValue(employee),
      findByUserId: jest
        .fn()
        .mockResolvedValue({ id: 'emp-boss', tenantId: 't1' }),
    };
    events = { emit: jest.fn() };
    const prisma = {
      $transaction: jest.fn((cb: (t: object) => unknown) => cb(tx)),
    };
    service = new LeavesService(
      prisma as never,
      repo as never,
      employees as never,
      events as never,
    );
  });

  const vacation = (start: string, end: string) => ({
    employeeId: 'emp-1',
    type: 'VACATION' as const,
    startDate: start,
    endDate: end,
  });

  it('reserves vacation days as pending after locking the employee', async () => {
    const leave = await service.request(
      't1',
      vacation('2026-10-05', '2026-10-10'),
      'u1',
    );

    expect(repo.lockEmployee).toHaveBeenCalledWith('t1', 'emp-1', tx);
    expect(repo.adjustBalance).toHaveBeenCalledWith(
      't1',
      'emp-1',
      2026,
      { pending: 6 },
      tx,
    );
    expect(leave).toMatchObject({ days: 6, type: 'VACATION' });
    expect(events.emit).toHaveBeenCalledWith('hr.leave.requested', {
      tenantId: 't1',
      leaveId: 'leave-1',
    });
  });

  it('rejects vacations above the available balance', async () => {
    // disponible = 18 - 5 - 3 = 10; solicita 11
    await expect(
      service.request('t1', vacation('2026-10-05', '2026-10-16'), 'u1'),
    ).rejects.toThrow('disponibles 10 día(s) hábil(es), solicitados 11');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('does not touch the balance for non-vacation leaves', async () => {
    await service.request(
      't1',
      { ...vacation('2026-10-05', '2026-10-30'), type: 'SICK' },
      'u1',
    );
    expect(repo.createBalanceIfMissing).not.toHaveBeenCalled();
    expect(repo.adjustBalance).not.toHaveBeenCalled();
  });

  it('rejects overlapping leaves', async () => {
    repo.findOverlapping.mockResolvedValue({ id: 'other' });
    await expect(
      service.request('t1', vacation('2026-10-05', '2026-10-06'), 'u1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an inverted range and a range with only Sundays', async () => {
    await expect(
      service.request('t1', vacation('2026-10-10', '2026-10-05'), 'u1'),
    ).rejects.toThrow('anterior a la de inicio');
    await expect(
      service.request('t1', vacation('2026-10-11', '2026-10-11'), 'u1'),
    ).rejects.toThrow('no tiene días hábiles');
  });

  it('rejects requests for terminated employees', async () => {
    employees.findById.mockResolvedValue({ ...employee, isActive: false });
    await expect(
      service.request('t1', vacation('2026-10-05', '2026-10-06'), 'u1'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('approves a pending vacation moving pending days to taken and records the approver', async () => {
    const pending = {
      id: 'leave-1',
      employeeId: 'emp-1',
      type: 'VACATION',
      status: 'PENDING',
      days: 4,
      startDate: d('2026-10-05'),
    };
    repo.findById
      .mockResolvedValueOnce(pending)
      .mockResolvedValue({ ...pending, status: 'APPROVED' });

    await service.approve('t1', 'leave-1', 'u-boss');

    expect(repo.transition).toHaveBeenCalledWith(
      't1',
      'leave-1',
      ['PENDING'],
      expect.objectContaining({ status: 'APPROVED', approvedById: 'emp-boss' }),
      tx,
    );
    expect(repo.adjustBalance).toHaveBeenCalledWith(
      't1',
      'emp-1',
      2026,
      { pending: -4, taken: 4 },
      tx,
    );
  });

  it('refuses to approve a leave that is not pending', async () => {
    repo.findById.mockResolvedValue({
      id: 'leave-1',
      status: 'REJECTED',
      type: 'VACATION',
      days: 1,
      startDate: d('2026-10-05'),
    });
    await expect(service.approve('t1', 'leave-1')).rejects.toThrow(
      'está rechazada',
    );
    expect(repo.transition).not.toHaveBeenCalled();
  });

  it('reports a concurrent change instead of double-adjusting the balance', async () => {
    repo.findById.mockResolvedValue({
      id: 'leave-1',
      status: 'PENDING',
      type: 'VACATION',
      days: 2,
      startDate: d('2026-10-05'),
    });
    repo.transition.mockResolvedValue(0);
    await expect(service.reject('t1', 'leave-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.adjustBalance).not.toHaveBeenCalled();
  });

  it('does not cancel an approved leave that already started', async () => {
    repo.findById.mockResolvedValue({
      id: 'leave-1',
      status: 'APPROVED',
      type: 'VACATION',
      days: 2,
      startDate: d('2020-01-01'),
    });
    await expect(service.cancel('t1', 'leave-1')).rejects.toThrow('ya comenzó');
  });

  it('creates the yearly balance with the legal entitlement when missing', async () => {
    repo.createBalanceIfMissing.mockResolvedValue({
      employeeId: 'emp-1',
      year: 2026,
      entitled: 18,
      taken: 0,
      pending: 0,
    });
    const balance = await service.getBalance('t1', 'emp-1', 2026);
    // ingreso 10/01/2020 → 6 años al cierre de 2026 → 18 días
    expect(repo.createBalanceIfMissing).toHaveBeenCalledWith(
      't1',
      'emp-1',
      2026,
      18,
    );
    expect(balance.available).toBe(18);
  });

  it('404s for an employee of another tenant', async () => {
    employees.findById.mockResolvedValue(null);
    await expect(
      service.getBalance('t1', 'emp-x', 2026),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

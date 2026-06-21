/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { EmployeesService } from './employees.service';

jest.mock('bcryptjs');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEmployee(overrides = {}) {
  return {
    id: 'emp-1',
    tenantId: 'tenant-1',
    employeeNumber: 1,
    firstName: 'Ana',
    lastName: 'Lopez',
    documentType: 'CI',
    documentNumber: '1234567',
    birthDate: new Date('1990-05-15'),
    hireDate: new Date('2023-01-10'),
    contractType: 'PERMANENT',
    baseSalary: 2_500_000,
    paymentMethod: 'BANK_TRANSFER',
    isActive: true,
    terminationDate: null,
    userId: null,
    area: null,
    position: null,
    manager: null,
    user: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('EmployeesService', () => {
  let service: EmployeesService;
  let employeesRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByUserId: jest.Mock;
    nextEmployeeNumber: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    linkUser: jest.Mock;
  };
  let prisma: {
    $transaction: jest.Mock;
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    employee: {
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) =>
        callback(prisma),
      ),
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      employee: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    employeesRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      nextEmployeeNumber: jest.fn().mockResolvedValue(1),
      create: jest.fn(),
      update: jest.fn(),
      linkUser: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };

    service = new EmployeesService(
      employeesRepository as any,
      prisma as any,
      eventEmitter as any,
    );
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('delegates to repository', () => {
      const employees = [makeEmployee()];
      employeesRepository.findAll.mockResolvedValue(employees);

      service.list('tenant-1');

      expect(employeesRepository.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── getById ────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns the employee when found', async () => {
      employeesRepository.findById.mockResolvedValue(makeEmployee());

      const result = await service.getById('tenant-1', 'emp-1');

      expect(result.id).toBe('emp-1');
    });

    it('throws NotFoundException when employee does not exist', async () => {
      employeesRepository.findById.mockResolvedValue(null);

      await expect(service.getById('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      firstName: 'Ana',
      lastName: 'Lopez',
      documentType: 'CI' as const,
      documentNumber: '1234567',
      birthDate: '1990-05-15',
      hireDate: '2023-01-10',
      baseSalary: 2_500_000,
    };

    it('creates employee without a user account when no email is provided', async () => {
      const created = makeEmployee();
      prisma.employee.create.mockResolvedValue(created);
      employeesRepository.nextEmployeeNumber.mockResolvedValue(1);

      const result = await service.create('tenant-1', baseDto);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            employeeNumber: 1,
          }),
        }),
      );
      expect(result.tempPassword).toBeUndefined();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.any(Object),
      );
    });

    it('creates employee and linked user when email is provided', async () => {
      const createdUser = { id: 'user-new' };
      const created = makeEmployee({ userId: 'user-new' });

      prisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-temp');
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.employee.create.mockResolvedValue(created);

      const result = await service.create('tenant-1', {
        ...baseDto,
        email: 'ana@company.com',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'ana@company.com',
            mustChangePassword: true,
          }),
        }),
      );
      expect(result.tempPassword).toBeDefined();
    });

    it('throws ConflictException if email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.create('tenant-1', { ...baseDto, email: 'taken@company.com' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.employee.create).not.toHaveBeenCalled();
    });
  });

  // ── terminate ─────────────────────────────────────────────────────────────

  describe('terminate', () => {
    it('terminates an active employee', async () => {
      const emp = makeEmployee();
      employeesRepository.findById
        .mockResolvedValueOnce(emp) // first call in terminate
        .mockResolvedValueOnce(
          makeEmployee({ terminationDate: new Date(), isActive: false }),
        ); // final getById

      await service.terminate('tenant-1', 'emp-1');

      expect(prisma.employee.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('also deactivates the linked user account when present', async () => {
      const emp = makeEmployee({ userId: 'user-1' });
      employeesRepository.findById
        .mockResolvedValueOnce(emp)
        .mockResolvedValueOnce(
          makeEmployee({ isActive: false, terminationDate: new Date() }),
        );

      await service.terminate('tenant-1', 'emp-1');

      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { status: 'INACTIVE' },
        }),
      );
    });

    it('throws UnprocessableEntityException if already terminated', async () => {
      employeesRepository.findById.mockResolvedValue(
        makeEmployee({ terminationDate: new Date('2024-01-01') }),
      );

      await expect(
        service.terminate('tenant-1', 'emp-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  // ── resetUserPassword ──────────────────────────────────────────────────────

  describe('resetUserPassword', () => {
    it('returns a temp password and sets mustChangePassword on the linked user', async () => {
      employeesRepository.findById.mockResolvedValue(
        makeEmployee({ userId: 'user-1' }),
      );
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-temp');

      const result = await service.resetUserPassword('tenant-1', 'emp-1');

      expect(result.tempPassword).toBeDefined();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ mustChangePassword: true }),
        }),
      );
    });

    it('throws UnprocessableEntityException if employee has no linked user', async () => {
      employeesRepository.findById.mockResolvedValue(
        makeEmployee({ userId: null }),
      );

      await expect(
        service.resetUserPassword('tenant-1', 'emp-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  // ── linkUser ───────────────────────────────────────────────────────────────

  describe('linkUser', () => {
    it('links an existing tenant user to the employee', async () => {
      const emp = makeEmployee();
      const user = { id: 'user-1', tenantId: 'tenant-1' };

      employeesRepository.findById.mockResolvedValue(emp);
      prisma.user.findUnique.mockResolvedValue(user);
      employeesRepository.findByUserId.mockResolvedValue(null);
      employeesRepository.findById
        .mockResolvedValueOnce(emp)
        .mockResolvedValueOnce(makeEmployee({ userId: 'user-1' }));

      await service.linkUser('tenant-1', 'emp-1', 'user@example.com');

      expect(employeesRepository.linkUser).toHaveBeenCalledWith(
        'tenant-1',
        'emp-1',
        'user-1',
      );
    });

    it('throws NotFoundException if no user with that email exists', async () => {
      employeesRepository.findById.mockResolvedValue(makeEmployee());
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.linkUser('tenant-1', 'emp-1', 'nobody@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException if user belongs to a different tenant', async () => {
      employeesRepository.findById.mockResolvedValue(makeEmployee());
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        tenantId: 'other-tenant',
      });

      await expect(
        service.linkUser('tenant-1', 'emp-1', 'foreign@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException if user is already linked to another employee', async () => {
      employeesRepository.findById.mockResolvedValue(makeEmployee());
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
      });
      employeesRepository.findByUserId.mockResolvedValue(
        makeEmployee({ id: 'emp-other' }),
      );

      await expect(
        service.linkUser('tenant-1', 'emp-1', 'linked@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

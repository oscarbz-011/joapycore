import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCustomer(overrides = {}) {
  return {
    id: 'cust-1',
    tenantId: 'tenant-1',
    firstName: 'María',
    lastName: 'González',
    email: 'maria@ejemplo.com',
    phone: '0981000000',
    address: 'Asunción',
    taxId: '1234567-8',
    isActive: true,
    deletedAt: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CustomersService', () => {
  let service: CustomersService;
  let customersRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };

  beforeEach(() => {
    customersRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    service = new CustomersService(customersRepository as any);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', () => {
      customersRepository.findAll.mockResolvedValue([makeCustomer()]);
      service.findAll('tenant-1');
      expect(customersRepository.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns customer when found', async () => {
      customersRepository.findById.mockResolvedValue(makeCustomer());
      const result = await service.findOne('tenant-1', 'cust-1');
      expect(result.id).toBe('cust-1');
    });

    it('throws NotFoundException when customer does not exist', async () => {
      customersRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('delegates to repository with tenantId and dto', async () => {
      const dto = { firstName: 'María', lastName: 'González', email: 'maria@ejemplo.com' };
      customersRepository.create.mockResolvedValue(makeCustomer());

      await service.create('tenant-1', dto);

      expect(customersRepository.create).toHaveBeenCalledWith('tenant-1', dto);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException if customer does not exist', async () => {
      customersRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('tenant-1', 'ghost', { firstName: 'Ana' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(customersRepository.update).not.toHaveBeenCalled();
    });

    it('updates customer when found', async () => {
      const updated = makeCustomer({ firstName: 'Ana' });
      customersRepository.findById.mockResolvedValue(makeCustomer());
      customersRepository.update.mockResolvedValue(updated);

      const result = await service.update('tenant-1', 'cust-1', { firstName: 'Ana' });

      expect(customersRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'cust-1',
        expect.objectContaining({ firstName: 'Ana' }),
      );
      expect(result.firstName).toBe('Ana');
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('throws NotFoundException if customer does not exist', async () => {
      customersRepository.findById.mockResolvedValue(null);

      await expect(service.delete('tenant-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);

      expect(customersRepository.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes the customer when found', async () => {
      customersRepository.findById.mockResolvedValue(makeCustomer());

      await service.delete('tenant-1', 'cust-1');

      expect(customersRepository.softDelete).toHaveBeenCalledWith('tenant-1', 'cust-1');
    });
  });
});

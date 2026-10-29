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
    documentType: 'CI',
    documentNumber: '1234567',
    customerCode: 'CLI-001',
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
    findPage?: jest.Mock;
    findById: jest.Mock;
    findLastCode: jest.Mock;
    findByEmail: jest.Mock;
    findByDocument: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
    setUncollectible: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    customersRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findLastCode: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByDocument: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      setUncollectible: jest.fn().mockResolvedValue({ count: 1 }),
    };
    eventEmitter = { emit: jest.fn() };

    service = new CustomersService(
      customersRepository as any,
      eventEmitter as any,
    );
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', async () => {
      customersRepository.findAll.mockResolvedValue([makeCustomer()]);
      await service.findAll('tenant-1');
      expect(customersRepository.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  // ── findPage ───────────────────────────────────────────────────────────────

  describe('findPage', () => {
    beforeEach(() => {
      customersRepository.findPage = jest
        .fn()
        .mockResolvedValue({ items: [makeCustomer()], total: 143 });
    });

    it('serves one page with the total of the whole list', async () => {
      const result = await service.findPage('tenant-1', { page: 2, limit: 25 });

      expect(customersRepository.findPage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ skip: 25, take: 25, words: [] }),
      );
      expect(result).toMatchObject({
        total: 143,
        page: 2,
        limit: 25,
        totalPages: 6,
      });
      expect(result.items).toHaveLength(1);
    });

    it('searches every word and sorts by the column asked for', async () => {
      await service.findPage('tenant-1', {
        q: ' maria  gonzalez ',
        sortBy: 'city',
        sortDir: 'desc',
      });

      expect(customersRepository.findPage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          words: ['maria', 'gonzalez'],
          orderBy: [{ city: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
        }),
      );
    });

    // Por apellido, y con desempate para que las páginas no se pisen.
    it('sorts by last name by default, with a stable tie-break', async () => {
      await service.findPage('tenant-1', {});

      expect(customersRepository.findPage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('ignores a sort column that is not offered', async () => {
      await service.findPage('tenant-1', { sortBy: 'creditLimit' });

      expect(customersRepository.findPage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('never serves more than 100 customers at once', async () => {
      await service.findPage('tenant-1', { limit: 5000 });

      expect(customersRepository.findPage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('findOne', () => {
    it('returns customer when found', async () => {
      customersRepository.findById.mockResolvedValue(makeCustomer());
      const result = await service.findOne('tenant-1', 'cust-1');
      expect(result.id).toBe('cust-1');
    });

    it('throws NotFoundException when customer does not exist', async () => {
      customersRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('auto-generates CLI-YY-000001 for the first customer and delegates to repository', async () => {
      const dto = {
        firstName: 'María',
        lastName: 'González',
        email: 'maria@ejemplo.com',
      };
      customersRepository.findLastCode.mockResolvedValue(null);
      customersRepository.create.mockResolvedValue(makeCustomer());

      await service.create('tenant-1', dto);

      expect(customersRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          firstName: 'María',
          customerCode: `CLI-${String(new Date().getFullYear()).slice(-2)}-000001`,
        }),
      );
    });

    it('increments the customer code when prior customers exist', async () => {
      const dto = { firstName: 'Ana', lastName: 'López' };
      const year = String(new Date().getFullYear()).slice(-2);
      customersRepository.findLastCode.mockResolvedValue({
        customerCode: `CLI-${year}-000003`,
      });
      customersRepository.create.mockResolvedValue(
        makeCustomer({ customerCode: `CLI-${year}-000004` }),
      );

      await service.create('tenant-1', dto);

      expect(customersRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          customerCode: `CLI-${year}-000004`,
          // Regresión: la tilde no parte la palabra ("LóPez").
          lastName: 'López',
        }),
      );
    });
  });

  // ── RUC y tipo de contribuyente ───────────────────────────────────────────

  describe('RUC', () => {
    it('rejects a RUC with a wrong check digit', async () => {
      await expect(
        service.create('tenant-1', {
          firstName: 'Ana',
          lastName: 'Pérez',
          documentType: 'RUC',
          documentNumber: '80069563-2',
        }),
      ).rejects.toThrow('El dígito verificador del RUC no es correcto');
      expect(customersRepository.create).not.toHaveBeenCalled();
    });

    it('asks for the check digit after a hyphen', async () => {
      await expect(
        service.create('tenant-1', {
          firstName: 'Ana',
          lastName: 'Pérez',
          documentType: 'RUC',
          documentNumber: '80069563',
        }),
      ).rejects.toThrow('separado por un guion');
    });

    it('keeps the legal name of a company as registered', async () => {
      customersRepository.findLastCode.mockResolvedValue(null);
      customersRepository.create.mockResolvedValue(makeCustomer());

      await service.create('tenant-1', {
        firstName: ' TIPS S.A. ',
        lastName: 'ignorado',
        documentType: 'RUC',
        documentNumber: '80069563-1',
        taxpayerType: 'COMPANY',
      });

      expect(customersRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          firstName: 'TIPS S.A.',
          lastName: '',
          taxpayerType: 'COMPANY',
        }),
      );
    });

    it('validates the RUC only when it changes on update', async () => {
      customersRepository.findById.mockResolvedValue(
        makeCustomer({ documentType: 'RUC', documentNumber: '123' }),
      );
      customersRepository.update.mockResolvedValue(makeCustomer());

      await service.update('tenant-1', 'cust-1', { phone: '0981' });
      await expect(
        service.update('tenant-1', 'cust-1', { documentNumber: '80069563-9' }),
      ).rejects.toThrow('dígito verificador');
    });
  });

  // ── documento duplicado ────────────────────────────────────────────────────

  describe('document number uniqueness', () => {
    it('rejects creating a customer with a document already used by an active one', async () => {
      customersRepository.findByDocument.mockResolvedValue({
        id: 'cust-9',
        customerCode: 'CLI-26-000009',
      });

      await expect(
        service.create('tenant-1', {
          firstName: 'Ana',
          lastName: 'Pérez',
          documentType: 'CI',
          documentNumber: ' 1234567 ',
        } as any),
      ).rejects.toThrow(
        'Ya existe un cliente con ese documento (CLI-26-000009)',
      );
      expect(customersRepository.findByDocument).toHaveBeenCalledWith(
        'tenant-1',
        'CI',
        '1234567',
        undefined,
      );
      expect(customersRepository.create).not.toHaveBeenCalled();
    });

    it('checks the merged type+number on update, excluding the customer itself', async () => {
      customersRepository.findById.mockResolvedValue(makeCustomer());
      customersRepository.update.mockResolvedValue(makeCustomer());

      await service.update('tenant-1', 'cust-1', { documentNumber: '7654321' });

      expect(customersRepository.findByDocument).toHaveBeenCalledWith(
        'tenant-1',
        'CI',
        '7654321',
        'cust-1',
      );
    });

    it('does not check when the document is not being changed', async () => {
      customersRepository.findById.mockResolvedValue(makeCustomer());
      customersRepository.update.mockResolvedValue(makeCustomer());

      await service.update('tenant-1', 'cust-1', { firstName: 'Ana' });

      expect(customersRepository.findByDocument).not.toHaveBeenCalled();
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

      const result = await service.update('tenant-1', 'cust-1', {
        firstName: 'Ana',
      });

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

      await expect(service.delete('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(customersRepository.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes the customer when found', async () => {
      customersRepository.findById.mockResolvedValue(makeCustomer());

      await service.delete('tenant-1', 'cust-1');

      expect(customersRepository.softDelete).toHaveBeenCalledWith(
        'tenant-1',
        'cust-1',
      );
    });
  });

  // ── incobrable/judicial ────────────────────────────────────────────────────

  describe('uncollectible mark', () => {
    it('marks the customer with the trimmed reason and audits who did it', async () => {
      customersRepository.findById.mockResolvedValue(makeCustomer());

      await service.markUncollectible(
        'tenant-1',
        'cust-1',
        '  En gestión judicial ',
        'user-1',
      );

      expect(customersRepository.setUncollectible).toHaveBeenCalledWith(
        'tenant-1',
        'cust-1',
        {
          uncollectibleAt: expect.any(Date),
          uncollectibleReason: 'En gestión judicial',
        },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'customer.uncollectible.marked',
          resourceId: 'cust-1',
        }),
      );
    });

    it('clears the mark and audits the previous reason', async () => {
      const markedAt = new Date('2026-09-30');
      customersRepository.findById.mockResolvedValue(
        makeCustomer({
          uncollectibleAt: markedAt,
          uncollectibleReason: 'Judicial',
        }),
      );

      await service.clearUncollectible('tenant-1', 'cust-1', 'user-1');

      expect(customersRepository.setUncollectible).toHaveBeenCalledWith(
        'tenant-1',
        'cust-1',
        { uncollectibleAt: null, uncollectibleReason: null },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'customer.uncollectible.cleared',
          before: {
            uncollectibleAt: markedAt,
            uncollectibleReason: 'Judicial',
          },
        }),
      );
    });

    it('does not touch a customer of another tenant', async () => {
      customersRepository.findById.mockResolvedValue(null);

      await expect(
        service.markUncollectible('tenant-2', 'cust-1', 'Judicial'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.clearUncollectible('tenant-2', 'cust-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(customersRepository.setUncollectible).not.toHaveBeenCalled();
    });
  });
});

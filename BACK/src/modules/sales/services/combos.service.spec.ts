import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CombosService } from './combos.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCombo(overrides = {}) {
  return {
    id: 'combo-1',
    tenantId: 'tenant-1',
    name: 'Combo Cocina',
    description: null,
    priceMode: 'FIXED',
    fixedPrice: 2000000,
    discountPercentage: null,
    isActive: true,
    items: [
      { id: 'item-1', productId: 'prod-1', quantity: 1 },
      { id: 'item-2', productId: 'prod-2', quantity: 1 },
    ],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CombosService', () => {
  let service: CombosService;
  let combosRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    combosRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn().mockResolvedValue({ count: 1 }),
    };
    eventEmitter = { emit: jest.fn() };
    service = new CombosService(combosRepository as any, eventEmitter as any);
  });

  describe('create', () => {
    it('creates a FIXED combo and emits audit.log', async () => {
      const created = makeCombo();
      combosRepository.create.mockResolvedValue(created);

      const result = await service.create(
        'tenant-1',
        {
          name: 'Combo Cocina',
          priceMode: 'FIXED' as any,
          fixedPrice: 2000000,
          items: [{ productId: 'prod-1', quantity: 1 }],
        },
        'user-1',
      );

      expect(combosRepository.create).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        module: 'sales',
        action: 'sale_combo.created',
        resourceId: created.id,
      }));
      expect(result.id).toBe('combo-1');
    });

    it('throws UnprocessableEntityException when FIXED without fixedPrice', async () => {
      await expect(
        service.create(
          'tenant-1',
          { name: 'Combo', priceMode: 'FIXED' as any, items: [{ productId: 'prod-1', quantity: 1 }] },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(combosRepository.create).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when SUM_WITH_DISCOUNT without discountPercentage', async () => {
      await expect(
        service.create(
          'tenant-1',
          { name: 'Combo', priceMode: 'SUM_WITH_DISCOUNT' as any, items: [{ productId: 'prod-1', quantity: 1 }] },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(combosRepository.create).not.toHaveBeenCalled();
    });

    it('allows SUM_WITH_DISCOUNT with discountPercentage 0', async () => {
      combosRepository.create.mockResolvedValue(makeCombo({ priceMode: 'SUM_WITH_DISCOUNT', discountPercentage: 0 }));

      await expect(
        service.create(
          'tenant-1',
          {
            name: 'Combo',
            priceMode: 'SUM_WITH_DISCOUNT' as any,
            discountPercentage: 0,
            items: [{ productId: 'prod-1', quantity: 1 }],
          },
          'user-1',
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('findOne', () => {
    it('returns the combo when it exists', async () => {
      combosRepository.findById.mockResolvedValue(makeCombo());
      const result = await service.findOne('tenant-1', 'combo-1');
      expect(result.id).toBe('combo-1');
    });

    it('throws NotFoundException when the combo does not exist', async () => {
      combosRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and emits audit.log', async () => {
      const existing = makeCombo();
      combosRepository.findById.mockResolvedValue(existing);
      combosRepository.update.mockResolvedValue({ ...existing, name: 'Combo Renombrado' });

      const result = await service.update('tenant-1', 'combo-1', { name: 'Combo Renombrado' }, 'user-1');

      expect(combosRepository.update).toHaveBeenCalledWith('tenant-1', 'combo-1', { name: 'Combo Renombrado' });
      expect(eventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.objectContaining({
        action: 'sale_combo.updated',
        resourceId: 'combo-1',
      }));
      expect(result.name).toBe('Combo Renombrado');
    });

    it('re-validates price mode using the existing combo when dto omits price fields', async () => {
      combosRepository.findById.mockResolvedValue(makeCombo({ priceMode: 'SUM_WITH_DISCOUNT', fixedPrice: null, discountPercentage: 15 }));
      combosRepository.update.mockResolvedValue(makeCombo());

      await expect(
        service.update('tenant-1', 'combo-1', { name: 'Nuevo nombre' }, 'user-1'),
      ).resolves.toBeDefined();
    });

    it('throws NotFoundException when the combo does not exist', async () => {
      combosRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('tenant-1', 'ghost', { name: 'X' }, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes and emits audit.log', async () => {
      combosRepository.findById.mockResolvedValue(makeCombo());

      await service.remove('tenant-1', 'combo-1', 'user-1');

      expect(combosRepository.softDelete).toHaveBeenCalledWith('tenant-1', 'combo-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.objectContaining({
        action: 'sale_combo.deleted',
        resourceId: 'combo-1',
      }));
    });

    it('throws NotFoundException when the combo does not exist', async () => {
      combosRepository.findById.mockResolvedValue(null);
      await expect(service.remove('tenant-1', 'ghost', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(combosRepository.softDelete).not.toHaveBeenCalled();
    });
  });
});

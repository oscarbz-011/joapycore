import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { StockEntryService } from './stock-entry.service';

function makeProduct(overrides = {}) {
  return {
    id: 'prod-1',
    tenantId: 'tenant-1',
    name: 'Aceite 5W30',
    isSerialized: false,
    usesLots: false,
    ...overrides,
  };
}

describe('StockEntryService', () => {
  let service: StockEntryService;
  let productsRepository: { findById: jest.Mock };
  let productUnitsRepository: { createMany: jest.Mock };
  let productBatchesRepository: {
    upsertBatch: jest.Mock;
    findAvailableFifo: jest.Mock;
    decrementRemaining: jest.Mock;
  };
  let prisma: {
    stockMovement: {
      create: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    productsRepository = { findById: jest.fn() };
    productUnitsRepository = { createMany: jest.fn() };
    productBatchesRepository = {
      upsertBatch: jest.fn(),
      findAvailableFifo: jest.fn(),
      decrementRemaining: jest.fn(),
    };
    prisma = {
      stockMovement: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        delete: jest.fn(),
      },
    };

    service = new StockEntryService(
      prisma as any,
      productsRepository as any,
      productUnitsRepository as any,
      productBatchesRepository as any,
    );
  });

  describe('registerEntry', () => {
    it('throws NotFoundException when the product does not exist', async () => {
      productsRepository.findById.mockResolvedValue(null);

      await expect(
        service.registerEntry('tenant-1', {
          productId: 'ghost',
          quantity: 5,
          reason: 'PURCHASE',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates ProductUnit rows for a serialized product, never a StockMovement', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ isSerialized: true }),
      );

      await service.registerEntry('tenant-1', {
        productId: 'prod-1',
        quantity: 2,
        reason: 'PURCHASE',
        serialNumbers: ['SN1', 'SN2'],
      });

      expect(productUnitsRepository.createMany).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
        ['SN1', 'SN2'],
        expect.objectContaining({}),
        prisma,
      );
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('rejects a serialized entry whose serial count does not match quantity', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ isSerialized: true }),
      );

      await expect(
        service.registerEntry('tenant-1', {
          productId: 'prod-1',
          quantity: 3,
          reason: 'PURCHASE',
          serialNumbers: ['SN1'],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('creates a plain IN movement for a non-lot-managed product', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ usesLots: false }),
      );

      await service.registerEntry('tenant-1', {
        productId: 'prod-1',
        quantity: 10,
        reason: 'PURCHASE',
        warehouseId: 'wh-1',
      });

      expect(productBatchesRepository.upsertBatch).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'IN',
            reason: 'PURCHASE',
            quantity: 10,
            batchId: undefined,
          }),
        }),
      );
    });

    it('requires unitCost when creating a batch', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ usesLots: true }),
      );

      await expect(
        service.registerEntry('tenant-1', {
          productId: 'prod-1',
          quantity: 10,
          reason: 'PURCHASE',
          batchNumber: 'LOTE-001',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('upserts the batch and stamps batchId on the movement for a lot-managed product', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ usesLots: true }),
      );
      productBatchesRepository.upsertBatch.mockResolvedValue({ id: 'batch-1' });

      await service.registerEntry('tenant-1', {
        productId: 'prod-1',
        quantity: 10,
        reason: 'PURCHASE',
        batchNumber: 'LOTE-001',
        unitCost: 65_000,
      });

      expect(productBatchesRepository.upsertBatch).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
        expect.objectContaining({
          batchNumber: 'LOTE-001',
          unitCost: 65_000,
          quantity: 10,
        }),
        prisma,
      );
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ batchId: 'batch-1' }),
        }),
      );
    });

    it('only sets initialSourceType for reason=INITIAL', async () => {
      productsRepository.findById.mockResolvedValue(makeProduct());

      await service.registerEntry('tenant-1', {
        productId: 'prod-1',
        quantity: 5,
        reason: 'PURCHASE',
        initialSourceType: 'MIGRATION',
      });

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ initialSourceType: undefined }),
        }),
      );
    });
  });

  describe('consumeFifo', () => {
    it('consumes the oldest batch first and returns its id', async () => {
      productBatchesRepository.findAvailableFifo.mockResolvedValue([
        { id: 'batch-old', remainingQty: 4 },
        { id: 'batch-new', remainingQty: 10 },
      ]);

      const firstBatchId = await service.consumeFifo(
        'tenant-1',
        'prod-1',
        6,
        'sale-item-1',
        prisma as any,
      );

      expect(
        productBatchesRepository.decrementRemaining,
      ).toHaveBeenNthCalledWith(1, 'batch-old', 4, prisma);
      expect(
        productBatchesRepository.decrementRemaining,
      ).toHaveBeenNthCalledWith(2, 'batch-new', 2, prisma);
      expect(firstBatchId).toBe('batch-old');
    });

    it('replaces the single combined OUT movement sales already created — never adds a second decrement', async () => {
      productBatchesRepository.findAvailableFifo.mockResolvedValue([
        { id: 'batch-old', remainingQty: 4 },
        { id: 'batch-new', remainingQty: 10 },
      ]);
      prisma.stockMovement.findFirst.mockResolvedValue({ id: 'sales-out-1' });

      await service.consumeFifo(
        'tenant-1',
        'prod-1',
        6,
        'sale-item-1',
        prisma as any,
      );

      expect(prisma.stockMovement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productId: 'prod-1',
            referenceId: 'sale-item-1',
            type: 'OUT',
            batchId: null,
          }),
        }),
      );
      expect(prisma.stockMovement.delete).toHaveBeenCalledWith({
        where: { id: 'sales-out-1' },
      });
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
      expect(prisma.stockMovement.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({ batchId: 'batch-old', quantity: -4 }),
        }),
      );
      expect(prisma.stockMovement.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({ batchId: 'batch-new', quantity: -2 }),
        }),
      );
      // El total descontado (4+2=6) es exactamente lo que ya había descontado
      // el movimiento combinado que se borró — nunca se resta stock dos veces.
    });

    it('does not throw when batch stock runs out before quantity is exhausted', async () => {
      productBatchesRepository.findAvailableFifo.mockResolvedValue([
        { id: 'batch-1', remainingQty: 2 },
      ]);

      const firstBatchId = await service.consumeFifo(
        'tenant-1',
        'prod-1',
        5,
        'sale-item-1',
        prisma as any,
      );

      expect(firstBatchId).toBe('batch-1');
    });
  });
});

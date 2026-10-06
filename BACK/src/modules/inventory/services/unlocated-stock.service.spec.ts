import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UnlocatedStockService } from './unlocated-stock.service';

describe('UnlocatedStockService', () => {
  const tx = { tx: true };
  let service: UnlocatedStockService;
  let prisma: { $transaction: jest.Mock };
  let productsRepository: { findById: jest.Mock };
  let productUnitsRepository: { locateUnassignedUnits: jest.Mock };
  let stockMovementsRepository: {
    lockProducts: jest.Mock;
    sumUnlocated: jest.Mock;
    sumByProductsAndWarehouse: jest.Mock;
    create: jest.Mock;
  };
  let warehousesRepository: { findById: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const dto = { productId: 'prod-1', warehouseId: 'wh-1' };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    productsRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'prod-1',
        name: 'Aire acondicionado',
        isSerialized: false,
      }),
    };
    productUnitsRepository = { locateUnassignedUnits: jest.fn() };
    stockMovementsRepository = {
      lockProducts: jest.fn(),
      sumUnlocated: jest.fn().mockResolvedValue(2),
      sumByProductsAndWarehouse: jest.fn().mockResolvedValue(new Map()),
      create: jest
        .fn()
        .mockImplementation((data) => Promise.resolve({ id: 'mov', ...data })),
    };
    warehousesRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'wh-1', isActive: true }),
    };
    eventEmitter = { emit: jest.fn() };
    service = new UnlocatedStockService(
      prisma as any,
      productsRepository as any,
      productUnitsRepository as any,
      stockMovementsRepository as any,
      warehousesRepository as any,
      eventEmitter as any,
    );
  });

  it('moves the whole unlocated balance into the warehouse as a linked pair', async () => {
    await service.assign('tenant-1', dto);

    expect(productsRepository.findById).toHaveBeenCalledWith(
      'tenant-1',
      'prod-1',
    );
    expect(warehousesRepository.findById).toHaveBeenCalledWith(
      'tenant-1',
      'wh-1',
    );
    expect(stockMovementsRepository.lockProducts).toHaveBeenCalledWith(
      tx,
      'tenant-1',
      ['prod-1'],
    );
    expect(stockMovementsRepository.sumUnlocated).toHaveBeenCalledWith(
      'tenant-1',
      'prod-1',
      tx,
    );
    const [out, incoming] = stockMovementsRepository.create.mock.calls.map(
      ([data]) => data,
    );
    expect(out).toMatchObject({
      tenantId: 'tenant-1',
      productId: 'prod-1',
      type: 'OUT',
      reason: 'TRANSFER',
      quantity: -2,
      warehouseId: null,
    });
    expect(incoming).toMatchObject({
      tenantId: 'tenant-1',
      productId: 'prod-1',
      type: 'IN',
      reason: 'TRANSFER',
      quantity: 2,
      warehouseId: 'wh-1',
    });
    expect(out.referenceId).toEqual(expect.any(String));
    expect(incoming.referenceId).toBe(out.referenceId);
  });

  it('moves only the requested part of the balance', async () => {
    stockMovementsRepository.sumUnlocated.mockResolvedValue(5);

    await service.assign('tenant-1', { ...dto, quantity: 3 });

    expect(
      stockMovementsRepository.create.mock.calls.map(([data]) => [
        data.warehouseId,
        data.quantity,
      ]),
    ).toEqual([
      [null, -3],
      ['wh-1', 3],
    ]);
  });

  it('rejects a quantity above the unlocated balance without writing', async () => {
    await expect(
      service.assign('tenant-1', { ...dto, quantity: 3 }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(stockMovementsRepository.create).not.toHaveBeenCalled();
  });

  it('rejects when the product has nothing unlocated', async () => {
    stockMovementsRepository.sumUnlocated.mockResolvedValue(0);

    await expect(service.assign('tenant-1', dto)).rejects.toThrow(
      'no tiene stock sin depósito',
    );
    expect(stockMovementsRepository.create).not.toHaveBeenCalled();
  });

  it('charges a negative unlocated balance to the warehouse', async () => {
    stockMovementsRepository.sumUnlocated.mockResolvedValue(-2);
    stockMovementsRepository.sumByProductsAndWarehouse.mockResolvedValue(
      new Map([['prod-1::wh-1', 10]]),
    );

    await service.assign('tenant-1', dto);

    expect(
      stockMovementsRepository.create.mock.calls.map(([data]) => [
        data.type,
        data.warehouseId,
        data.quantity,
      ]),
    ).toEqual([
      ['OUT', 'wh-1', -2],
      ['IN', null, 2],
    ]);
  });

  it('rejects a negative balance the warehouse cannot absorb', async () => {
    stockMovementsRepository.sumUnlocated.mockResolvedValue(-2);
    stockMovementsRepository.sumByProductsAndWarehouse.mockResolvedValue(
      new Map([['prod-1::wh-1', 1]]),
    );

    await expect(service.assign('tenant-1', dto)).rejects.toThrow(
      'No hay stock suficiente',
    );
    expect(stockMovementsRepository.create).not.toHaveBeenCalled();
  });

  it('locates every unassigned serialized unit when no serials are given', async () => {
    productsRepository.findById.mockResolvedValue({
      id: 'prod-1',
      name: 'TV',
      isSerialized: true,
    });
    productUnitsRepository.locateUnassignedUnits.mockResolvedValue(4);

    await service.assign('tenant-1', dto);

    expect(productUnitsRepository.locateUnassignedUnits).toHaveBeenCalledWith(
      'tenant-1',
      'prod-1',
      'wh-1',
      undefined,
      tx,
    );
    expect(stockMovementsRepository.sumUnlocated).not.toHaveBeenCalled();
    expect(
      stockMovementsRepository.create.mock.calls.map(([data]) => [
        data.warehouseId,
        data.quantity,
      ]),
    ).toEqual([
      [null, -4],
      ['wh-1', 4],
    ]);
  });

  it('rejects serials that are not unassigned and in stock', async () => {
    productsRepository.findById.mockResolvedValue({
      id: 'prod-1',
      name: 'TV',
      isSerialized: true,
    });
    productUnitsRepository.locateUnassignedUnits.mockResolvedValue(1);

    await expect(
      service.assign('tenant-1', { ...dto, serialNumbers: ['A', 'B'] }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(stockMovementsRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a product of another tenant', async () => {
    productsRepository.findById.mockResolvedValue(null);

    await expect(service.assign('tenant-2', dto)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing, foreign or inactive warehouse', async () => {
    warehousesRepository.findById.mockResolvedValue({
      id: 'wh-1',
      isActive: false,
    });

    await expect(service.assign('tenant-1', dto)).rejects.toThrow(
      'El depósito no existe o está inactivo',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

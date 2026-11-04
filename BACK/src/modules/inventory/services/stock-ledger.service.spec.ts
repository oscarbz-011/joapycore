import { UnprocessableEntityException } from '@nestjs/common';
import { StockLedgerService } from './stock-ledger.service';

describe('StockLedgerService', () => {
  let service: StockLedgerService;
  let stockMovements: {
    lockProducts: jest.Mock;
    sumByProductsAndWarehouse: jest.Mock;
  };
  let productUnits: {
    findBySerialForUpdate: jest.Mock;
    assignToSaleItem: jest.Mock;
  };
  let stockLocations: { findById: jest.Mock };

  beforeEach(() => {
    stockMovements = {
      lockProducts: jest.fn(),
      sumByProductsAndWarehouse: jest.fn().mockResolvedValue(
        new Map([
          ['prod-1::wh-1', 2],
          ['prod-1::wh-2', 10],
        ]),
      ),
    };
    productUnits = {
      findBySerialForUpdate: jest.fn(),
      assignToSaleItem: jest.fn(),
    };
    stockLocations = {
      findById: jest.fn().mockResolvedValue({ id: 'wh-1', isActive: true }),
    };
    service = new (StockLedgerService as any)(
      stockMovements as any,
      productUnits as any,
      stockLocations,
    );
  });

  it('rejects demand from an inactive warehouse', async () => {
    stockLocations.findById.mockResolvedValue({
      id: 'wh-1',
      isActive: false,
    });

    await expect(
      service.assertAvailable({} as any, 'tenant-1', [
        {
          productId: 'prod-1',
          warehouseId: 'wh-1',
          quantity: 1,
        },
      ]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('checks availability per product and warehouse', async () => {
    await expect(
      service.assertAvailable({} as any, 'tenant-1', [
        {
          productId: 'prod-1',
          warehouseId: 'wh-1',
          quantity: 3,
          name: 'Heladera',
        },
      ]),
    ).rejects.toThrow('Heladera (disponible 2, pedido 3)');

    expect(stockMovements.sumByProductsAndWarehouse).toHaveBeenCalled();
  });

  it('rejects a sold serial selected from another warehouse', async () => {
    productUnits.findBySerialForUpdate.mockResolvedValue({
      id: 'unit-1',
      status: 'IN_STOCK',
      warehouseId: 'wh-2',
    });

    await expect(
      service.assignSerialUnits(
        {} as any,
        'tenant-1',
        'prod-1',
        ['SN-1'],
        'item-1',
        'wh-1',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(productUnits.assignToSaleItem).not.toHaveBeenCalled();
  });

  describe('customer returns', () => {
    const tx = { marker: 'tx' } as any;
    let movements: { create: jest.Mock };
    let units: {
      findSoldBySaleItems: jest.Mock;
      restoreSoldSerials: jest.Mock;
    };
    let sources: { findSaleItemsForReturn: jest.Mock };
    let ledger: StockLedgerService;

    beforeEach(() => {
      movements = { create: jest.fn() };
      units = {
        findSoldBySaleItems: jest.fn().mockResolvedValue([
          { saleOrderItemId: 'soi-tv', serialNumber: 'SN-1' },
          { saleOrderItemId: 'soi-tv', serialNumber: 'SN-2' },
        ]),
        restoreSoldSerials: jest.fn().mockResolvedValue(1),
      };
      sources = {
        findSaleItemsForReturn: jest.fn().mockResolvedValue([
          {
            id: 'soi-rice',
            productId: 'p-rice',
            warehouseId: 'wh-1',
            quantity: 5,
            product: { isSerialized: false },
          },
          {
            id: 'soi-tv',
            productId: 'p-tv',
            warehouseId: 'wh-1',
            quantity: 2,
            product: { isSerialized: true },
          },
          {
            id: 'soi-free',
            productId: null,
            warehouseId: null,
            quantity: 1,
            product: null,
          },
        ]),
      };
      ledger = new StockLedgerService(
        movements as any,
        units as any,
        {} as any,
        sources as any,
      );
    });

    it('tells what each sold line can return', async () => {
      const result = await ledger.findReturnable(tx, 'tenant-1', [
        'soi-rice',
        'soi-tv',
        'soi-free',
      ]);
      expect(result.get('soi-tv')).toEqual({
        stocked: true,
        isSerialized: true,
        soldSerials: ['SN-1', 'SN-2'],
      });
      expect(result.get('soi-rice')).toEqual({
        stocked: true,
        isSerialized: false,
        soldSerials: [],
      });
      expect(result.get('soi-free')?.stocked).toBe(false);
      expect(sources.findSaleItemsForReturn).toHaveBeenCalledWith(
        'tenant-1',
        ['soi-rice', 'soi-tv', 'soi-free'],
        tx,
      );
    });

    it('puts a quantity back with a customer return movement', async () => {
      await ledger.restockReturn(tx, 'tenant-1', 'cn-1', [
        { saleItemId: 'soi-rice', quantity: 2, serialNumbers: [] },
      ]);
      expect(movements.create).toHaveBeenCalledWith(
        {
          tenantId: 'tenant-1',
          productId: 'p-rice',
          warehouseId: 'wh-1',
          type: 'IN',
          reason: 'CUSTOMER_RETURN',
          quantity: 2,
          referenceId: 'cn-1',
        },
        tx,
      );
    });

    it('returns only the chosen serial numbers', async () => {
      await ledger.restockReturn(tx, 'tenant-1', 'cn-1', [
        { saleItemId: 'soi-tv', quantity: 1, serialNumbers: ['SN-2'] },
      ]);
      expect(units.restoreSoldSerials).toHaveBeenCalledWith(
        'tenant-1',
        'soi-tv',
        ['SN-2'],
        tx,
      );
      expect(movements.create).not.toHaveBeenCalled();
    });

    it.each([
      [
        { saleItemId: 'soi-tv', quantity: 2, serialNumbers: ['SN-1'] },
        'un número de serie por cada unidad',
      ],
      [
        { saleItemId: 'soi-free', quantity: 1, serialNumbers: [] },
        'no mueve stock',
      ],
    ])('rejects %j', async (line, message) => {
      await expect(
        ledger.restockReturn(tx, 'tenant-1', 'cn-1', [line]),
      ).rejects.toThrow(message);
    });

    it('rejects a serial number that is not of this sale', async () => {
      units.restoreSoldSerials.mockResolvedValue(0);
      await expect(
        ledger.restockReturn(tx, 'tenant-1', 'cn-1', [
          { saleItemId: 'soi-tv', quantity: 1, serialNumbers: ['OTRO'] },
        ]),
      ).rejects.toThrow('no corresponde a esta venta');
    });
  });
});

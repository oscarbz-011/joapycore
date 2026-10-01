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
});

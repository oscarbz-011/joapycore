import { Prisma } from '@prisma/client';
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
  let stockSources: { findWarehouse: jest.Mock };

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
    stockSources = {
      findWarehouse: jest
        .fn()
        .mockResolvedValue({ id: 'wh-1', isActive: true }),
    };
    service = new (StockLedgerService as any)(
      stockMovements as any,
      productUnits as any,
      stockSources,
    );
  });

  it('rejects demand from an inactive warehouse', async () => {
    stockSources.findWarehouse.mockResolvedValue({
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
            product: { isSerialized: false, unitCode: 77 },
          },
          {
            id: 'soi-tv',
            productId: 'p-tv',
            warehouseId: 'wh-1',
            quantity: 2,
            product: { isSerialized: true, unitCode: 77 },
          },
          {
            id: 'soi-free',
            productId: null,
            warehouseId: null,
            quantity: 1,
            product: null,
          },
          {
            id: 'soi-board',
            productId: 'p-board',
            warehouseId: 'wh-1',
            quantity: 3,
            unitCode: 77,
            unitFactor: '5.0325',
            product: { name: 'MDF 18 mm', unitCode: 109, isSerialized: false },
          },
        ]),
      };
      ledger = new StockLedgerService(
        movements as any,
        units as any,
        sources as any,
        {} as any,
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

    it('puts back what a returned presentation holds, counted in whole sheets', async () => {
      await ledger.restockReturn(tx, 'tenant-1', 'cn-1', [
        { saleItemId: 'soi-board', quantity: 2, serialNumbers: [] },
      ]);
      expect(movements.create).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p-board', quantity: '10.065' }),
        tx,
      );
      await expect(
        ledger.restockReturn(tx, 'tenant-1', 'cn-1', [
          { saleItemId: 'soi-board', quantity: 1.5, serialNumbers: [] },
        ]),
      ).rejects.toThrow('se cuenta por unidad entera');
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

  describe('dispatch and receive', () => {
    const tx = {} as any;
    let movements: {
      create: jest.Mock;
      lockProducts: jest.Mock;
      sumByProductsAndWarehouse: jest.Mock;
    };
    let units: {
      dispatchUnits: jest.Mock;
      receiveUnits: jest.Mock;
      loseInTransit: jest.Mock;
    };
    let locations: { findWarehouse: jest.Mock };
    let products: { findForTransfer: jest.Mock };
    let ledger: StockLedgerService;

    const dispatch = (lines: any[]) => ({
      referenceId: 'rn-1',
      fromWarehouseId: 'wh-a',
      toWarehouseId: 'wh-b',
      notes: 'Nota de remisión 001-001-0000001',
      lines,
    });

    beforeEach(() => {
      movements = {
        create: jest.fn(),
        lockProducts: jest.fn(),
        sumByProductsAndWarehouse: jest
          .fn()
          .mockResolvedValue(new Map([['p-rice::wh-a', 10]])),
      };
      units = {
        dispatchUnits: jest.fn().mockResolvedValue(2),
        receiveUnits: jest.fn().mockResolvedValue(1),
        loseInTransit: jest.fn().mockResolvedValue(1),
      };
      locations = {
        findWarehouse: jest
          .fn()
          .mockImplementation((_t: string, id: string) => ({
            id,
            isActive: true,
          })),
      };
      products = {
        findForTransfer: jest.fn().mockResolvedValue([
          { id: 'p-rice', name: 'Arroz', isSerialized: false, unitCode: 77 },
          { id: 'p-tv', name: 'Televisor', isSerialized: true, unitCode: 77 },
        ]),
      };
      ledger = new StockLedgerService(
        movements as any,
        units as any,
        locations as any,
        products as any,
      );
    });

    it('takes the goods out of the origin and leaves them in transit', async () => {
      await ledger.dispatch(
        tx,
        'tenant-1',
        dispatch([
          { productId: 'p-rice', quantity: 4, serialNumbers: [] },
          { productId: 'p-tv', quantity: 2, serialNumbers: ['SN-1', 'SN-2'] },
        ]),
      );
      expect(movements.lockProducts).toHaveBeenCalledWith(tx, 'tenant-1', [
        'p-rice',
      ]);
      expect(units.dispatchUnits).toHaveBeenCalledWith(
        'tenant-1',
        'p-tv',
        ['SN-1', 'SN-2'],
        'wh-a',
        'wh-b',
        tx,
      );
      expect(movements.create).toHaveBeenCalledTimes(2);
      expect(movements.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'p-rice',
          warehouseId: 'wh-a',
          type: 'OUT',
          reason: 'TRANSFER',
          quantity: -4,
          referenceId: 'rn-1',
        }),
        tx,
      );
      expect(movements.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'IN' }),
        tx,
      );
    });

    it('rejects more than the origin has', async () => {
      await expect(
        ledger.dispatch(
          tx,
          'tenant-1',
          dispatch([{ productId: 'p-rice', quantity: 11, serialNumbers: [] }]),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(movements.create).not.toHaveBeenCalled();
    });

    it('rejects a serial number that is not free in the origin', async () => {
      units.dispatchUnits.mockResolvedValue(1);
      await expect(
        ledger.dispatch(
          tx,
          'tenant-1',
          dispatch([
            { productId: 'p-tv', quantity: 2, serialNumbers: ['SN-1', 'SN-9'] },
          ]),
        ),
      ).rejects.toThrow('no está disponible en el depósito de origen');
    });

    it.each([
      [
        { productId: 'p-tv', quantity: 2, serialNumbers: ['SN-1', 'SN-1'] },
        'un número de serie por cada unidad',
      ],
      [{ productId: 'p-gone', quantity: 1, serialNumbers: [] }, 'no existe'],
    ])('rejects %j', async (line, message) => {
      await expect(
        ledger.dispatch(tx, 'tenant-1', dispatch([line])),
      ).rejects.toThrow(message);
    });

    it('rejects the same warehouse and an inactive one', async () => {
      await expect(
        ledger.dispatch(tx, 'tenant-1', {
          ...dispatch([
            { productId: 'p-rice', quantity: 1, serialNumbers: [] },
          ]),
          toWarehouseId: 'wh-a',
        }),
      ).rejects.toThrow('distintos');
      locations.findWarehouse.mockResolvedValueOnce({
        id: 'wh-a',
        isActive: false,
      });
      await expect(
        ledger.dispatch(
          tx,
          'tenant-1',
          dispatch([{ productId: 'p-rice', quantity: 1, serialNumbers: [] }]),
        ),
      ).rejects.toThrow('inactivo');
    });

    it('puts what arrived in the destination and writes off what did not', async () => {
      await ledger.receive(tx, 'tenant-1', {
        referenceId: 'rn-1',
        warehouseId: 'wh-b',
        notes: 'Recepción',
        lines: [
          { productId: 'p-rice', quantity: 3, serialNumbers: [] },
          { productId: 'p-tv', quantity: 1, serialNumbers: ['SN-1'] },
        ],
        lostSerials: [{ productId: 'p-tv', serialNumbers: ['SN-2'] }],
      });
      expect(units.receiveUnits).toHaveBeenCalledWith(
        'tenant-1',
        'p-tv',
        ['SN-1'],
        'wh-b',
        tx,
      );
      expect(units.loseInTransit).toHaveBeenCalledWith(
        'tenant-1',
        'p-tv',
        ['SN-2'],
        tx,
      );
      expect(movements.create).toHaveBeenCalledTimes(2);
      expect(movements.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'p-rice',
          warehouseId: 'wh-b',
          type: 'IN',
          reason: 'TRANSFER',
          quantity: 3,
          referenceId: 'rn-1',
        }),
        tx,
      );
    });

    it('rejects a serial number that is not in transit', async () => {
      units.receiveUnits.mockResolvedValue(0);
      await expect(
        ledger.receive(tx, 'tenant-1', {
          referenceId: 'rn-1',
          warehouseId: 'wh-b',
          notes: 'Recepción',
          lines: [{ productId: 'p-tv', quantity: 1, serialNumbers: ['SN-9'] }],
          lostSerials: [],
        }),
      ).rejects.toThrow('no está en tránsito');
    });
  });

  it('lists what a warehouse has, with its free serial numbers', async () => {
    const ledger = new StockLedgerService(
      {
        sumByWarehouse: jest.fn().mockResolvedValue(
          new Map([
            ['p-rice', new Prisma.Decimal(5)],
            ['p-tv', new Prisma.Decimal(2)],
            ['p-gone', new Prisma.Decimal(0)],
          ]),
        ),
      } as any,
      {
        findFreeInWarehouse: jest.fn().mockResolvedValue([
          { productId: 'p-tv', serialNumber: 'SN-1' },
          { productId: 'p-tv', serialNumber: 'SN-2' },
        ]),
      } as any,
      {} as any,
      {} as any,
    );
    await expect(
      ledger.availableIn({} as any, 'tenant-1', 'wh-a'),
    ).resolves.toEqual([
      { productId: 'p-rice', quantity: 5, serialNumbers: [] },
      { productId: 'p-tv', quantity: 2, serialNumbers: ['SN-1', 'SN-2'] },
    ]);
  });
});

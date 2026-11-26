import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductPresentationsService } from './product-presentations.service';

const dec = (v: string | number) => new Prisma.Decimal(v);

describe('ProductPresentationsService', () => {
  const products = { findById: jest.fn() };
  const presentations = {
    findByProduct: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((_t: string, _p: string, data: unknown) => data),
    update: jest.fn(
      (_t: string, _p: string, _id: string, data: unknown) => data,
    ),
  };
  const service = new ProductPresentationsService(
    products as never,
    presentations as never,
  );

  const board = {
    id: 'p1',
    name: 'MDF 18 mm',
    unitCode: 109,
    isSerialized: false,
  };
  const cable = {
    id: 'p2',
    name: 'Cable 2 mm',
    unitCode: 87,
    isSerialized: false,
  };
  const soda = { id: 'p3', name: 'Gaseosa', unitCode: 77, isSerialized: false };

  beforeEach(() => jest.clearAllMocks());

  it('computes a board from its dimensions', async () => {
    products.findById.mockResolvedValue(board);

    const created = await service.create('t1', 'p1', {
      name: ' Plancha entera ',
      length: 2.75,
      width: 1.83,
      salePrice: 480000,
    });

    expect(created).toEqual({
      name: 'Plancha entera',
      unitCode: 77,
      salePrice: 480000,
      factor: dec('5.0325'),
      length: 2.75,
      width: 1.83,
      height: null,
    });
  });

  it('computes a roll of cable from its length', async () => {
    products.findById.mockResolvedValue(cable);

    const created = await service.create('t1', 'p2', {
      name: 'Rollo 100 m',
      length: 100,
      salePrice: 350000,
    });

    expect(created).toMatchObject({ factor: dec(100) });
  });

  it('rejects a typed factor on a measured product', async () => {
    products.findById.mockResolvedValue(board);

    await expect(
      service.create('t1', 'p1', { name: 'X', factor: 5, salePrice: 1 }),
    ).rejects.toThrow('la presentación se define con sus medidas');
  });

  it('takes a typed factor for a counted product, in whole units', async () => {
    products.findById.mockResolvedValue(soda);

    await expect(
      service.create('t1', 'p3', {
        name: 'Pack de 6',
        factor: 6,
        salePrice: 54000,
      }),
    ).resolves.toMatchObject({ factor: dec(6), length: null });
    await expect(
      service.create('t1', 'p3', { name: 'Medio', factor: 0.5, salePrice: 1 }),
    ).rejects.toThrow('se cuenta por unidad entera');
    await expect(
      service.create('t1', 'p3', { name: 'Sin factor', salePrice: 1 }),
    ).rejects.toThrow('Indicá cuánto del producto lleva la presentación');
    await expect(
      service.create('t1', 'p3', { name: 'Medida', length: 2, salePrice: 1 }),
    ).rejects.toThrow('La unidad UNI no se calcula con medidas');
  });

  it('refuses presentations for serialized products and other tenants', async () => {
    products.findById.mockResolvedValueOnce({ ...soda, isSerialized: true });
    await expect(service.list('t1', 'p3')).rejects.toThrow(
      'Un producto con número de serie se vende por unidad',
    );

    products.findById.mockResolvedValueOnce(null);
    await expect(service.list('t2', 'p3')).rejects.toThrow(NotFoundException);
    expect(products.findById).toHaveBeenLastCalledWith('t2', 'p3');
  });

  it('recomputes the factor when only one dimension changes', async () => {
    products.findById.mockResolvedValue(board);
    presentations.findOne.mockResolvedValue({
      factor: dec('5.0325'),
      length: dec('2.75'),
      width: dec('1.83'),
      height: null,
    });

    const updated = await service.update('t1', 'p1', 'pp1', { width: 0.9 });

    expect(updated).toMatchObject({
      factor: dec('2.475'),
      length: 2.75,
      width: 0.9,
    });
  });

  it('keeps the measures when only the price changes', async () => {
    products.findById.mockResolvedValue(board);
    presentations.findOne.mockResolvedValue({ factor: dec('5.0325') });

    const updated = await service.update('t1', 'p1', 'pp1', {
      salePrice: 500000,
    });

    expect(updated).not.toHaveProperty('factor');
    expect(updated).toMatchObject({ salePrice: 500000 });
  });

  it('explains a repeated name', async () => {
    products.findById.mockResolvedValue(soda);
    presentations.create.mockRejectedValueOnce({ code: 'P2002' } as never);

    await expect(
      service.create('t1', 'p3', {
        name: 'Pack de 6',
        factor: 6,
        salePrice: 1,
      }),
    ).rejects.toThrow(ConflictException);
  });
});

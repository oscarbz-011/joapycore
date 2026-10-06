/// <reference types="jest" />

import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupplierCatalogService } from './supplier-catalog.service';

describe('SupplierCatalogService', () => {
  let service: SupplierCatalogService;
  let repository: {
    findBySupplier: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    upsert: jest.Mock;
    supplierExists: jest.Mock;
    productExists: jest.Mock;
  };
  let parser: { parse: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const file = { buffer: Buffer.from('x'), originalname: 'lista.xlsx' };

  beforeEach(() => {
    repository = {
      findBySupplier: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue({ id: 'item-1', productId: null }),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      supplierExists: jest
        .fn()
        .mockResolvedValue({ id: 'sup-1', name: 'Maderera' }),
      productExists: jest
        .fn()
        .mockResolvedValue({ id: 'prod-1', name: 'Tablero' }),
    };
    parser = {
      parse: jest.fn().mockResolvedValue({
        rows: [{ supplierSku: 'A-1', description: 'Algo', price: 100 }],
        errors: [],
      }),
    };
    eventEmitter = { emit: jest.fn() };
    service = new SupplierCatalogService(
      repository as never,
      parser as never,
      eventEmitter as never,
    );
  });

  describe('importFile', () => {
    it('upserts every parsed row and reports the count', async () => {
      const result = await service.importFile(
        'tenant-1',
        'sup-1',
        file,
        'user-1',
      );

      expect(repository.upsert).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ imported: 1, errors: [], totalRows: 1 });
    });

    // El punto central de la Fase 1: una fila mala no aborta el archivo.
    it('imports the good rows and returns the rejected ones', async () => {
      parser.parse.mockResolvedValue({
        rows: [
          { supplierSku: 'A-1', description: 'Buena', price: 100 },
          { supplierSku: 'A-2', description: 'Otra', price: 200 },
        ],
        errors: [{ row: 4, message: 'Falta la descripción' }],
      });

      const result = await service.importFile('tenant-1', 'sup-1', file);

      expect(repository.upsert).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        imported: 2,
        errors: [{ row: 4, message: 'Falta la descripción' }],
        totalRows: 3,
      });
    });

    // Un archivo entero inválido no es "0 importados": es un problema de
    // formato y hay que avisarlo fuerte.
    it('throws when no row is usable, naming the first problem', async () => {
      parser.parse.mockResolvedValue({
        rows: [],
        errors: [{ row: 2, message: 'Falta el código del proveedor' }],
      });

      await expect(
        service.importFile('tenant-1', 'sup-1', file),
      ).rejects.toThrow(/fila 2 — Falta el código del proveedor/);
    });

    it('throws NotFoundException for an unknown supplier', async () => {
      repository.supplierExists.mockResolvedValue(null);

      await expect(
        service.importFile('tenant-1', 'ghost', file),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(parser.parse).not.toHaveBeenCalled();
    });

    it('audits the import', async () => {
      await service.importFile('tenant-1', 'sup-1', file, 'user-1');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({ action: 'supplier.catalog.imported' }),
      );
    });
  });

  describe('price validity', () => {
    it('stamps every imported row with the validity of the list', async () => {
      await service.importFile('tenant-1', 'sup-1', file, 'user-1', {
        validFrom: '2026-10-01',
        validTo: '2026-10-31',
      });

      expect(repository.upsert).toHaveBeenCalledWith(
        'tenant-1',
        'sup-1',
        expect.objectContaining({
          supplierSku: 'A-1',
          validFrom: new Date('2026-10-01T00:00:00.000Z'),
          validTo: new Date('2026-10-31T00:00:00.000Z'),
        }),
      );
    });

    // Una lista nueva trae precios nuevos: conservar la vigencia de la lista
    // anterior los dejaría marcados como vencidos (o vigentes) por error.
    it('clears the previous validity when the new list has none', async () => {
      await service.importFile('tenant-1', 'sup-1', file);

      expect(repository.upsert).toHaveBeenCalledWith(
        'tenant-1',
        'sup-1',
        expect.objectContaining({ validFrom: null, validTo: null }),
      );
    });

    it('rejects a list that ends before it starts, without importing', async () => {
      await expect(
        service.importFile('tenant-1', 'sup-1', file, 'user-1', {
          validFrom: '2026-10-31',
          validTo: '2026-10-01',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('updates and clears the validity of one item', async () => {
      await service.update('tenant-1', 'item-1', {
        validFrom: null,
        validTo: '2026-12-31',
      });

      expect(repository.update).toHaveBeenCalledWith('tenant-1', 'item-1', {
        validFrom: null,
        validTo: new Date('2026-12-31T00:00:00.000Z'),
      });
    });

    it('checks an edited end date against the start date already stored', async () => {
      repository.findById.mockResolvedValue({
        id: 'item-1',
        productId: null,
        validFrom: new Date('2026-10-10T00:00:00.000Z'),
        validTo: null,
      });

      await expect(
        service.update('tenant-1', 'item-1', { validTo: '2026-10-01' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('leaves the validity alone when an edit does not mention it', async () => {
      await service.update('tenant-1', 'item-1', { price: 500 });

      expect(repository.update).toHaveBeenCalledWith('tenant-1', 'item-1', {
        price: 500,
      });
    });
  });

  describe('mapToProduct', () => {
    it('links the item to an internal product', async () => {
      await service.mapToProduct('tenant-1', 'item-1', { productId: 'prod-1' });

      expect(repository.update).toHaveBeenCalledWith('tenant-1', 'item-1', {
        productId: 'prod-1',
      });
    });

    // Un ítem mal mapeado tiene que poder volver a "suelto" sin perder el
    // precio ni el historial de importación.
    it('unlinks when productId comes as null', async () => {
      await service.mapToProduct('tenant-1', 'item-1', { productId: null });

      expect(repository.update).toHaveBeenCalledWith('tenant-1', 'item-1', {
        productId: null,
      });
      expect(repository.productExists).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product does not exist', async () => {
      repository.productExists.mockResolvedValue(null);

      await expect(
        service.mapToProduct('tenant-1', 'item-1', { productId: 'ghost' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown catalog item', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.mapToProduct('tenant-1', 'ghost', { productId: 'prod-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findBySupplier', () => {
    it('validates the supplier before listing', async () => {
      repository.supplierExists.mockResolvedValue(null);

      await expect(
        service.findBySupplier('tenant-1', 'ghost', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('passes the filters through to the repository', async () => {
      await service.findBySupplier('tenant-1', 'sup-1', { unmapped: true });

      expect(repository.findBySupplier).toHaveBeenCalledWith(
        'tenant-1',
        'sup-1',
        {
          unmapped: true,
        },
      );
    });
  });
});

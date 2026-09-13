import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ProductComponentsService } from './product-components.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides = {}) {
  return {
    id: 'mesa-1',
    name: 'Mesa de comedor',
    kind: 'MANUFACTURED' as const,
    unit: 'unidad',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProductComponentsService', () => {
  let service: ProductComponentsService;
  let repository: {
    findByProduct: jest.Mock;
    findOne: jest.Mock;
    findExisting: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findProduct: jest.Mock;
    findComponentIds: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      findByProduct: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      findExisting: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'pc-1' }),
      update: jest.fn(),
      delete: jest.fn(),
      findProduct: jest.fn(),
      findComponentIds: jest.fn().mockResolvedValue([]),
    };
    service = new ProductComponentsService(repository as any);
  });

  const dto = { componentId: 'tablero-1', quantity: 3 };

  describe('addComponent', () => {
    it('adds a component to a manufactured product', async () => {
      repository.findProduct
        .mockResolvedValueOnce(makeProduct())
        .mockResolvedValueOnce(
          makeProduct({
            id: 'tablero-1',
            name: 'Tablero MDF',
            kind: 'RAW_MATERIAL',
          }),
        );

      await service.addComponent('tenant-1', 'mesa-1', dto);

      expect(repository.create).toHaveBeenCalledWith('tenant-1', {
        productId: 'mesa-1',
        componentId: 'tablero-1',
        quantity: 3,
        notes: undefined,
      });
    });

    it.each(['RESALE', 'RAW_MATERIAL'])(
      'refuses to build a recipe on a %s product',
      async (kind) => {
        repository.findProduct.mockResolvedValue(makeProduct({ kind }));

        await expect(
          service.addComponent('tenant-1', 'mesa-1', dto),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);

        expect(repository.create).not.toHaveBeenCalled();
      },
    );

    it('refuses a product as its own component', async () => {
      repository.findProduct.mockResolvedValue(makeProduct());

      await expect(
        service.addComponent('tenant-1', 'mesa-1', {
          componentId: 'mesa-1',
          quantity: 1,
        }),
      ).rejects.toThrow(/no puede ser componente de sí mismo/);
    });

    it('refuses a duplicate component instead of creating a second row', async () => {
      repository.findProduct
        .mockResolvedValueOnce(makeProduct())
        .mockResolvedValueOnce(
          makeProduct({ id: 'tablero-1', name: 'Tablero MDF' }),
        );
      repository.findExisting.mockResolvedValue({ id: 'pc-existing' });

      await expect(
        service.addComponent('tenant-1', 'mesa-1', dto),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException when the component does not exist', async () => {
      repository.findProduct
        .mockResolvedValueOnce(makeProduct())
        .mockResolvedValueOnce(null);

      await expect(
        service.addComponent('tenant-1', 'mesa-1', dto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // ── Ciclos ────────────────────────────────────────────────────────────

    it('refuses a direct cycle (A lleva B, B ya lleva A)', async () => {
      repository.findProduct
        .mockResolvedValueOnce(makeProduct())
        .mockResolvedValueOnce(makeProduct({ id: 'tablero-1' }));
      // La receta del componente ya incluye al producto que se está armando.
      repository.findComponentIds.mockResolvedValueOnce([
        { componentId: 'mesa-1' },
      ]);

      await expect(
        service.addComponent('tenant-1', 'mesa-1', dto),
      ).rejects.toThrow(/ciclo en la receta/);

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('refuses an indirect cycle (A → B → C → A)', async () => {
      repository.findProduct
        .mockResolvedValueOnce(makeProduct())
        .mockResolvedValueOnce(makeProduct({ id: 'tablero-1' }));
      repository.findComponentIds
        .mockResolvedValueOnce([{ componentId: 'pata-1' }]) // tablero lleva pata
        .mockResolvedValueOnce([{ componentId: 'mesa-1' }]); // pata lleva la mesa

      await expect(
        service.addComponent('tenant-1', 'mesa-1', dto),
      ).rejects.toThrow(/ciclo en la receta/);
    });

    it('does not loop forever when the existing recipe already has a cycle', async () => {
      repository.findProduct
        .mockResolvedValueOnce(makeProduct())
        .mockResolvedValueOnce(makeProduct({ id: 'tablero-1' }));
      // tablero → pata → tablero: sin el set de visitados, esto colgaría.
      repository.findComponentIds.mockImplementation((_t: string, id: string) =>
        Promise.resolve(
          id === 'tablero-1'
            ? [{ componentId: 'pata-1' }]
            : [{ componentId: 'tablero-1' }],
        ),
      );

      await service.addComponent('tenant-1', 'mesa-1', dto);

      expect(repository.create).toHaveBeenCalled();
    });
  });

  describe('findByProduct', () => {
    it('throws NotFoundException when the product does not exist', async () => {
      repository.findProduct.mockResolvedValue(null);

      await expect(
        service.findByProduct('tenant-1', 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

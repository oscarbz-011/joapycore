import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

const unitErrors = (dto: object, unitCode: unknown) =>
  validateSync(
    plainToInstance(dto as never, {
      name: 'Plancha de MDF',
      isSerialized: false,
      unitCode,
    }),
  ).filter((error) => error.property === 'unitCode');

describe('product unit of measure', () => {
  it.each([CreateProductDto, UpdateProductDto])(
    '%p accepts a code of the SIFEN table or none',
    (dto) => {
      expect(unitErrors(dto, 109)).toEqual([]);
      expect(unitErrors(dto, undefined)).toEqual([]);
    },
  );

  it.each([CreateProductDto, UpdateProductDto])(
    '%p rejects a code outside the SIFEN table',
    (dto) => {
      const [error] = unitErrors(dto, 1);
      expect(Object.values(error?.constraints ?? {})).toContain(
        'La unidad de medida no está en la tabla de SIFEN',
      );
      expect(unitErrors(dto, 'unidad')).toHaveLength(1);
    },
  );
});

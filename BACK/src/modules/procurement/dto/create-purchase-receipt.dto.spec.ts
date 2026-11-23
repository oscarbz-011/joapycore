import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePurchaseReceiptDto } from './create-purchase-receipt.dto';

const warehouseErrors = (warehouseId: unknown) =>
  validateSync(
    plainToInstance(CreatePurchaseReceiptDto, {
      warehouseId,
      items: [
        {
          purchaseOrderItemId: '5f0c7c1e-8a3b-4f6e-9d2a-1b2c3d4e5f60',
          quantity: 1,
        },
      ],
    }),
  ).filter((error) => error.property === 'warehouseId');

describe('CreatePurchaseReceiptDto warehouseId', () => {
  it('accepts a warehouse id', () => {
    expect(warehouseErrors('0b6f1d2e-3c4a-4b5d-8e6f-7a8b9c0d1e2f')).toEqual([]);
  });

  it.each([undefined, null, ''])(
    'asks for the warehouse when it is %p',
    (value) => {
      const [error] = warehouseErrors(value);
      expect(Object.values(error?.constraints ?? {})).toContain(
        'Elegí el depósito de ingreso',
      );
    },
  );
});

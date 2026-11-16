import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto';

const birthDateErrors = (birthDate: unknown) =>
  validateSync(
    plainToInstance(CreateCustomerDto, {
      firstName: 'María',
      lastName: 'González',
      birthDate,
    }),
  ).filter((error) => error.property === 'birthDate');

describe('CreateCustomerDto birthDate', () => {
  it('accepts a calendar day, null or nothing', () => {
    expect(birthDateErrors('1990-05-20')).toEqual([]);
    expect(birthDateErrors(null)).toEqual([]);
    expect(birthDateErrors(undefined)).toEqual([]);
  });

  it('rejects a day that does not exist', () => {
    expect(birthDateErrors('1990-02-31')).not.toEqual([]);
  });

  it('rejects other formats and a time of day', () => {
    expect(birthDateErrors('20/05/1990')).not.toEqual([]);
    expect(birthDateErrors('1990-05-20T00:00:00.000Z')).not.toEqual([]);
    expect(birthDateErrors(19900520)).not.toEqual([]);
  });
});

import { IsString } from 'class-validator';
import { AppValidationPipe, StrictValidation } from './app-validation.pipe';

class LegacyDto {
  @IsString()
  name!: string;
}

@StrictValidation()
class StrictDto extends LegacyDto {}

class ChildDto extends StrictDto {}

describe('AppValidationPipe', () => {
  const pipe = new AppValidationPipe();

  it('preserves stripping unknown properties on existing DTOs', async () => {
    await expect(
      pipe.transform(
        { name: 'test', tenantId: 'untrusted' },
        { type: 'body', metatype: LegacyDto },
      ),
    ).resolves.toEqual({ name: 'test' });
  });

  it.each([StrictDto, ChildDto])(
    'rejects unknown fields for %p',
    async (dto) => {
      await expect(
        pipe.transform(
          { name: 'test', tenantId: 'untrusted' },
          { type: 'body', metatype: dto },
        ),
      ).rejects.toThrow('Bad Request');
    },
  );

  it('transforms a valid strict DTO', async () => {
    await expect(
      pipe.transform({ name: 'test' }, { type: 'body', metatype: StrictDto }),
    ).resolves.toBeInstanceOf(StrictDto);
  });
});

import { ArgumentMetadata, SetMetadata, ValidationPipe } from '@nestjs/common';

const STRICT_VALIDATION = 'validation:strict';

/** Opt-in strict DTO validation without changing legacy endpoint contracts. */
export const StrictValidation = () => SetMetadata(STRICT_VALIDATION, true);

export class AppValidationPipe extends ValidationPipe {
  private readonly strict = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  constructor() {
    super({ whitelist: true, transform: true });
  }

  override transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    if (
      metadata.metatype &&
      Reflect.getMetadata(STRICT_VALIDATION, metadata.metatype)
    ) {
      return this.strict.transform(value, metadata);
    }
    return super.transform(value, metadata);
  }
}

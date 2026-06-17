import { SetMetadata } from '@nestjs/common';

export const REQUIRED_MODULE_KEY = 'requiredModule';
export const RequiredModule = (moduleName: string) =>
  SetMetadata(REQUIRED_MODULE_KEY, moduleName);

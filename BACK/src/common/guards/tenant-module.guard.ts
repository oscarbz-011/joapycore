import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRED_MODULE_KEY } from '../decorators/required-module.decorator';
import { JwtPayload } from '../types/jwt-payload.interface';

@Injectable()
export class TenantModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModule = this.reflector.getAllAndOverride<string>(
      REQUIRED_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModule) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (!user?.activeModules?.includes(requiredModule)) {
      throw new ForbiddenException(
        `Module "${requiredModule}" is not active for this tenant`,
      );
    }

    return true;
  }
}

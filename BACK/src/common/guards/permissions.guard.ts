import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../types/jwt-payload.interface';
import { resolveAccessRule } from './access-rule';

// Niega por defecto: una ruta sin regla declarada no se abre por olvido.
@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const rule = resolveAccessRule(context.getHandler(), context.getClass());
    if (!rule) throw new ForbiddenException('Insufficient permissions');

    if (rule.kind === 'public' || rule.kind === 'authenticated') return true;

    const granted =
      context.switchToHttp().getRequest<Request & { user?: JwtPayload }>().user
        ?.permissions ?? [];
    const allowed =
      rule.kind === 'all'
        ? rule.permissions.every((p) => granted.includes(p))
        : rule.permissions.some((p) => granted.includes(p));

    if (!allowed) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  AnyPermission,
  Authenticated,
  Permissions,
} from '../decorators/permissions.decorator';
import { Public } from '../decorators/public.decorator';
import { PermissionsGuard } from './permissions.guard';

class Controller {
  unmarked() {}

  @Public()
  open() {}

  @Authenticated()
  mine() {}

  @Permissions('sales:read', 'sales:update')
  both() {}

  @AnyPermission('sales:read', 'sales:quotes:read')
  either() {}
}

@Permissions('tenants:update')
class Settings {
  inherited() {}

  @Authenticated()
  overridden() {}
}

@Authenticated()
class Profile {
  @Permissions('users:update')
  stricter() {}
}

function context(
  controller: { prototype: object },
  handler: string,
  permissions?: string[],
) {
  const fn = (controller.prototype as Record<string, unknown>)[handler];
  return {
    getHandler: () => fn,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ user: permissions && { permissions } }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard();
  const allows = (...args: Parameters<typeof context>) =>
    guard.canActivate(context(...args));

  it('denies an endpoint that declares no rule, whatever the permissions', () => {
    expect(() => allows(Controller, 'unmarked', ['sales:read'])).toThrow(
      ForbiddenException,
    );
  });

  it('lets anyone through a public endpoint', () => {
    expect(allows(Controller, 'open')).toBe(true);
  });

  it('only needs a session for @Authenticated', () => {
    expect(allows(Controller, 'mine', [])).toBe(true);
  });

  it('requires every permission of @Permissions', () => {
    expect(allows(Controller, 'both', ['sales:read', 'sales:update'])).toBe(
      true,
    );
    expect(() => allows(Controller, 'both', ['sales:read'])).toThrow(
      ForbiddenException,
    );
  });

  it('requires one of the permissions of @AnyPermission', () => {
    expect(allows(Controller, 'either', ['sales:quotes:read'])).toBe(true);
    expect(() => allows(Controller, 'either', ['sales:create'])).toThrow(
      ForbiddenException,
    );
  });

  it('denies a permission rule when the request has no user', () => {
    expect(() => allows(Controller, 'either')).toThrow(ForbiddenException);
  });

  it('applies the controller rule to methods without their own', () => {
    expect(allows(Settings, 'inherited', ['tenants:update'])).toBe(true);
    expect(() => allows(Settings, 'inherited', [])).toThrow(ForbiddenException);
  });

  it("lets a method's rule replace the controller's, both ways", () => {
    expect(allows(Settings, 'overridden', [])).toBe(true);
    expect(() => allows(Profile, 'stricter', [])).toThrow(ForbiddenException);
  });
});

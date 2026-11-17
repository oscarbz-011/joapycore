import { SetMetadata } from '@nestjs/common';
import { Permission } from '../constants/permissions.constant';

export const PERMISSIONS_KEY = 'permissions';
export const ANY_PERMISSION_KEY = 'anyPermission';
export const AUTHENTICATED_KEY = 'authenticated';

/** Exige todos los permisos. */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Alcanza con uno: para rutas donde el permiso depende del caso y el servicio
 * hace la revisión fina.
 */
export const AnyPermission = (...permissions: Permission[]) =>
  SetMetadata(ANY_PERMISSION_KEY, permissions);

/** Solo exige sesión: datos propios del usuario. */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);

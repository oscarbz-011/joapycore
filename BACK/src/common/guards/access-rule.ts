import { Permission } from '../constants/permissions.constant';
import {
  ANY_PERMISSION_KEY,
  AUTHENTICATED_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export type AccessRule =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'all'; permissions: Permission[] }
  | { kind: 'any'; permissions: Permission[] };

type Target = object;

/** Las reglas que declara un método o un controller, sin heredar. */
export function declaredRules(target: Target): AccessRule[] {
  const rules: AccessRule[] = [];
  const read = <T>(key: string) =>
    Reflect.getMetadata(key, target) as T | undefined;

  if (read<boolean>(IS_PUBLIC_KEY)) rules.push({ kind: 'public' });
  if (read<boolean>(AUTHENTICATED_KEY)) rules.push({ kind: 'authenticated' });
  const all = read<Permission[]>(PERMISSIONS_KEY);
  if (all?.length) rules.push({ kind: 'all', permissions: all });
  const any = read<Permission[]>(ANY_PERMISSION_KEY);
  if (any?.length) rules.push({ kind: 'any', permissions: any });
  return rules;
}

/**
 * La regla del método reemplaza a la del controller. `null` si ninguno
 * declara una: el guard la niega.
 */
export function resolveAccessRule(
  handler: Target,
  controller: Target,
): AccessRule | null {
  return declaredRules(handler)[0] ?? declaredRules(controller)[0] ?? null;
}

export const PERMISSIONS_CHANGED_EVENT = 'auth.permissions.changed';

// Sin userId el cambio es de un rol y alcanza a toda la empresa.
export function permissionsChangeAffects(
  payload: unknown,
  userId: string | undefined,
): boolean {
  if (!userId || !payload || typeof payload !== 'object') return false;
  const target = (payload as { userId?: unknown }).userId;
  return target === undefined || target === null || target === userId;
}

export interface PermissionChanges {
  added: string[];
  removed: string[];
}

export function permissionChanges(
  saved: readonly string[],
  selected: ReadonlySet<string>,
): PermissionChanges {
  const savedSet = new Set(saved);
  return {
    added: [...selected].filter((key) => !savedSet.has(key)).sort(),
    removed: saved.filter((key) => !selected.has(key)).sort(),
  };
}

export function pendingChangesLabel({ added, removed }: PermissionChanges): string {
  const total = added.length + removed.length;
  if (total === 0) return 'Sin cambios';
  return total === 1 ? '1 cambio sin guardar' : `${total} cambios sin guardar`;
}

import { describe, expect, it } from 'vitest';
import {
  pendingChangesLabel,
  permissionChanges,
  permissionsChangeAffects,
} from './permissions-refresh';

describe('permissionsChangeAffects', () => {
  it('reaches everyone when a role changed', () => {
    expect(permissionsChangeAffects({ tenantId: 't-1' }, 'u-1')).toBe(true);
  });

  it('reaches only the user whose roles changed', () => {
    expect(
      permissionsChangeAffects({ tenantId: 't-1', userId: 'u-1' }, 'u-1'),
    ).toBe(true);
    expect(
      permissionsChangeAffects({ tenantId: 't-1', userId: 'u-2' }, 'u-1'),
    ).toBe(false);
  });

  it('ignores it without a session or a payload', () => {
    expect(permissionsChangeAffects({ tenantId: 't-1' }, undefined)).toBe(false);
    expect(permissionsChangeAffects(null, 'u-1')).toBe(false);
  });
});

describe('permissionChanges', () => {
  it('lists what was added and removed', () => {
    expect(
      permissionChanges(
        ['sales:read', 'documents:manage'],
        new Set(['sales:read', 'documents:read']),
      ),
    ).toEqual({ added: ['documents:read'], removed: ['documents:manage'] });
  });

  it('finds nothing when the selection matches what is saved', () => {
    expect(
      permissionChanges(['b', 'a'], new Set(['a', 'b'])),
    ).toEqual({ added: [], removed: [] });
  });
});

describe('pendingChangesLabel', () => {
  it('counts additions and removals together', () => {
    expect(pendingChangesLabel({ added: [], removed: [] })).toBe('Sin cambios');
    expect(pendingChangesLabel({ added: ['a'], removed: [] })).toBe(
      '1 cambio sin guardar',
    );
    expect(pendingChangesLabel({ added: ['a'], removed: ['b'] })).toBe(
      '2 cambios sin guardar',
    );
  });
});

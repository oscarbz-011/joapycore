import { describe, expect, it } from 'vitest';
import { closedGroupBadge, isNavItemActive } from './sidebar-nav';

describe('isNavItemActive', () => {
  it('marks the entry of the screen that is open', () => {
    expect(isNavItemActive('/dashboard/notes', '/dashboard/notes')).toBe(true);
    expect(isNavItemActive('/dashboard/chat', '/dashboard/notes')).toBe(false);
  });

  // Crear o editar una nota sigue siendo estar en Notas.
  it('covers the screens inside a section only when asked to', () => {
    expect(isNavItemActive('/dashboard/notes/new', '/dashboard/notes')).toBe(false);
    expect(isNavItemActive('/dashboard/notes/new', '/dashboard/notes', true)).toBe(true);
  });

  it('does not confuse a section with another that starts the same', () => {
    expect(isNavItemActive('/dashboard/notes-archive', '/dashboard/notes', true)).toBe(false);
  });
});

describe('closedGroupBadge', () => {
  it('adds up what the entries of the group show', () => {
    expect(closedGroupBadge([{ badge: 12 }, { badge: 3 }, {}])).toBe(15);
    expect(closedGroupBadge([{}, {}])).toBe(0);
  });
});

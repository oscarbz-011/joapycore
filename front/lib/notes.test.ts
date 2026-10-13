import { describe, expect, it } from 'vitest';
import type { UserNote } from './api/notes';
import { countByPriority, filterNotes, noteChanges, noteDate, parseView, priorityOf } from './notes';

const note = (id: string, overrides: Partial<UserNote> = {}): UserNote => ({
  id,
  title: id,
  body: '',
  priority: 'MEDIUM',
  starred: false,
  trashedAt: null,
  createdAt: '2026-10-13T12:00:00.000Z',
  updatedAt: '2026-10-13T12:00:00.000Z',
  ...overrides,
});

const notes = [
  note('a', { title: 'Llamar al proveedor', body: 'Pedir la cotización', priority: 'HIGH' }),
  note('b', { title: 'Reunión de cobranzas', priority: 'MEDIUM' }),
  note('c', { title: 'Comprar papel', body: 'Para la impresora del depósito', priority: 'LOW' }),
];

describe('parseView', () => {
  it('reads the view from the link and falls back to all the notes', () => {
    expect(parseView('trash')).toBe('trash');
    expect(parseView(null)).toBe('all');
    expect(parseView('everyone')).toBe('all');
  });
});

describe('filterNotes', () => {
  it('searches the title and the text without minding accents', () => {
    expect(filterNotes(notes, 'cotizacion', null).map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(notes, 'REUNION', null).map((n) => n.id)).toEqual(['b']);
    expect(filterNotes(notes, 'deposito papel', null).map((n) => n.id)).toEqual(['c']);
  });

  it('keeps one priority', () => {
    expect(filterNotes(notes, '', 'HIGH').map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(notes, 'papel', 'HIGH')).toEqual([]);
  });

  it('returns everything without filters', () => {
    expect(filterNotes(notes, '  ', null)).toHaveLength(3);
  });
});

describe('countByPriority', () => {
  it('counts the notes of each priority', () => {
    expect(countByPriority(notes)).toEqual({ HIGH: 1, MEDIUM: 1, LOW: 1 });
    expect(countByPriority([])).toEqual({ HIGH: 0, MEDIUM: 0, LOW: 0 });
  });
});

describe('noteChanges', () => {
  const original = { title: 'Llamar', body: '', priority: 'MEDIUM' as const, starred: false };

  it('sends only what changed, with the title trimmed', () => {
    expect(noteChanges(original, { ...original, title: ' Llamar hoy ', starred: true })).toEqual({
      title: 'Llamar hoy',
      starred: true,
    });
  });

  it('is nothing when nothing changed or the title is missing', () => {
    expect(noteChanges(original, { ...original, title: 'Llamar ' })).toBeNull();
    expect(noteChanges(original, { ...original, title: '   ', body: 'algo' })).toBeNull();
  });
});

describe('presentation', () => {
  it('names each priority', () => {
    expect(priorityOf('HIGH').label).toBe('Alta');
    expect(priorityOf('LOW').label).toBe('Baja');
  });

  // 02:00 UTC del 14 todavía es el 13 en Paraguay.
  it('shows the date in Paraguay as dd/mm/aa', () => {
    expect(noteDate('2026-10-14T02:00:00.000Z')).toBe('13/10/26');
  });
});

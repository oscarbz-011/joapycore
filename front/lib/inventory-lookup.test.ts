import { describe, expect, it } from 'vitest';
import { activeLookups, findLookupByName } from './inventory-lookup';

const brands = [
  { id: 'b-1', name: 'SAMSUNG', isActive: true },
  { id: 'b-2', name: 'TOKYO', isActive: true },
  { id: 'b-3', name: 'PEQUEÑOS ELECTRODOMÉSTICOS', isActive: false },
];

describe('findLookupByName', () => {
  it('finds an existing entry whatever the case, accents or spacing', () => {
    expect(findLookupByName(brands, '  samsung ')?.id).toBe('b-1');
    expect(findLookupByName(brands, 'pequeños  electrodomesticos')?.id).toBe(
      'b-3',
    );
  });

  it('returns nothing for a new or blank name', () => {
    expect(findLookupByName(brands, 'Smartfy')).toBeUndefined();
    expect(findLookupByName(brands, '   ')).toBeUndefined();
  });
});

describe('activeLookups', () => {
  it('offers only the active entries', () => {
    expect(activeLookups(brands, '').map((b) => b.id)).toEqual(['b-1', 'b-2']);
  });

  // Si ya estaba elegida y después se desactivó, no puede desaparecer del
  // selector con el valor puesto.
  it('keeps the selected entry even when it is inactive', () => {
    expect(activeLookups(brands, 'b-3').map((b) => b.id)).toEqual([
      'b-1',
      'b-2',
      'b-3',
    ]);
  });
});

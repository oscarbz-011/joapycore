import { describe, expect, it } from 'vitest';
import { defaultPicks } from './catalog-match';

const item = (
  id: string,
  supplierId: string,
  description: string,
  extra: { score?: number; barcode?: string } = {},
) => ({
  id,
  supplierId,
  description,
  barcode: extra.barcode ?? null,
  score: extra.score ?? 1,
});

describe('defaultPicks', () => {
  // Caso real: "adaptador" encuentra dos productos distintos en cada lista.
  // Lo que se compara por defecto tiene que ser el mismo producto en las dos,
  // no el primero de cada una.
  it('lines up the same product across suppliers when a search is ambiguous', () => {
    const picks = defaultPicks([
      item('c-cooler', 'central', 'ADAPTADOR COOLER MASTER LGA 1700'),
      item('b-carplay', 'b', 'ADAPTADOR CARPLAY SMARTFY CAF01'),
      item('c-carplay', 'central', 'ADAPTADOR CARPLAY SMARTFY CAF01'),
      item('b-cooler', 'b', 'ADAPTADOR COOLER MASTER LGA 1700'),
    ]);

    const descriptions = new Set(Object.values(picks).map((id) => id.split('-')[1]));
    expect(descriptions.size).toBe(1);
  });

  it('starts from the best match of the search', () => {
    const picks = defaultPicks([
      item('a-exact', 'a', 'ABRIDOR DE VINO SMARTFY', { score: 1 }),
      item('a-other', 'a', 'ABRIDOR DE LATAS', { score: 0.5 }),
      item('b-other', 'b', 'ABRIDOR DE LATAS MANUAL', { score: 0.5 }),
      item('b-exact', 'b', 'Abridor de vino Smartfy 10W', { score: 0.6 }),
    ]);

    expect(picks).toEqual({ a: 'a-exact', b: 'b-exact' });
  });

  // El código de barras manda sobre la descripción.
  it('matches by barcode even when the descriptions differ', () => {
    const picks = defaultPicks([
      item('a-1', 'a', 'ABRIDOR DE VINO', { barcode: '789' }),
      item('b-text', 'b', 'ABRIDOR DE VINO GENERICO'),
      item('b-code', 'b', 'SACACORCHOS ELECT.', { barcode: '789', score: 0.5 }),
    ]);

    expect(picks.b).toBe('b-code');
  });

  it('gives the same answer whatever order the results arrive in', () => {
    const results = [
      item('c-cooler', 'central', 'ADAPTADOR COOLER MASTER'),
      item('b-carplay', 'b', 'ADAPTADOR CARPLAY'),
      item('c-carplay', 'central', 'ADAPTADOR CARPLAY'),
      item('b-cooler', 'b', 'ADAPTADOR COOLER MASTER'),
    ];

    expect(defaultPicks(results)).toEqual(defaultPicks([...results].reverse()));
  });

  it('has nothing to pick without results', () => {
    expect(defaultPicks([])).toEqual({});
  });
});

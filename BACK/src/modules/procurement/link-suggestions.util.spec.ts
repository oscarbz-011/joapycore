import {
  productTokens,
  rankCatalogSearch,
  rankLinkSuggestions,
} from './link-suggestions.util';

const item = (id: string, description: string, supplierId = 'sup-b') => ({
  id,
  supplierId,
  description,
});

describe('productTokens', () => {
  it('keeps the meaningful words of the name and the model, without accents or case', () => {
    expect(
      productTokens({ name: 'Abridor de Vinho SMARTFY', model: 'AV01B' }),
    ).toEqual(['abridor', 'vinho', 'smartfy', 'av01b']);
  });

  it('drops short words and repeats', () => {
    expect(productTokens({ name: 'TV de 43 TV Smart', model: null })).toEqual([
      'smart',
    ]);
  });

  it('keeps short codes that carry digits', () => {
    expect(productTokens({ name: 'Horno 45L', model: 'H2' })).toEqual([
      'horno',
      '45l',
      'h2',
    ]);
  });
});

describe('rankLinkSuggestions', () => {
  const product = {
    name: 'ABRIDOR DE VINHO SMARTFY AV01B 10W BLACK',
    model: null,
  };

  it('suggests the items that share most of the product words, best first', () => {
    const ranked = rankLinkSuggestions(product, [
      item('partial', 'Abridor de vinho eléctrico Smartfy'),
      item('exact', 'ABRIDOR DE VINHO SMARTFY AV01B 10W BLACK'),
      item('unrelated', 'ADAPTADOR CARPLAY SMARTFY'),
    ]);

    expect(ranked.map((r) => r.item.id)).toEqual(['exact', 'partial']);
    expect(ranked[0].score).toBe(1);
  });

  // Una sola palabra en común (la marca) no alcanza para proponer un vínculo.
  it('does not suggest an item that only shares one word', () => {
    expect(
      rankLinkSuggestions(product, [item('brand', 'PARLANTE SMARTFY 20W')]),
    ).toEqual([]);
  });

  it('ignores accents, case and punctuation', () => {
    const ranked = rankLinkSuggestions(
      { name: 'Batidora Eléctrica Philips', model: null },
      [item('a', 'BATIDORA ELECTRICA, PHILIPS (750W)')],
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBe(1);
  });

  it('keeps the best few of each supplier', () => {
    const items = [1, 2, 3, 4, 5].map((n) =>
      item(`b-${n}`, `ABRIDOR DE VINHO SMARTFY modelo ${n}`),
    );
    const ranked = rankLinkSuggestions(product, [
      ...items,
      item('c-1', 'ABRIDOR DE VINHO SMARTFY', 'sup-c'),
    ]);

    expect(ranked.filter((r) => r.item.supplierId === 'sup-b')).toHaveLength(3);
    expect(ranked.filter((r) => r.item.supplierId === 'sup-c')).toHaveLength(1);
  });

  it('accepts a one-word product when that word matches', () => {
    expect(
      rankLinkSuggestions({ name: 'Ventilador', model: null }, [
        item('a', 'VENTILADOR DE PIE 18"'),
      ]),
    ).toHaveLength(1);
  });
});

describe('rankCatalogSearch', () => {
  const entry = (
    id: string,
    description: string,
    extra: { supplierId?: string; supplierSku?: string; barcode?: string } = {},
  ) => ({
    id,
    supplierId: extra.supplierId ?? 'sup-a',
    description,
    supplierSku: extra.supplierSku ?? id,
    barcode: extra.barcode ?? null,
  });

  it('finds the items that match what was typed, in any supplier', () => {
    const ranked = rankCatalogSearch('abridor de vino', [
      entry('a', 'ABRIDOR DE VINO ELECTRICO SMARTFY'),
      entry('b', 'Abridor de vino manual', { supplierId: 'sup-b' }),
      entry('c', 'ADAPTADOR CARPLAY'),
    ]);

    expect(ranked.map((r) => r.item.id).sort()).toEqual(['a', 'b']);
  });

  it('puts the closest match first', () => {
    const ranked = rankCatalogSearch('abridor vino smartfy', [
      entry('partial', 'Abridor de vino genérico'),
      entry('full', 'ABRIDOR DE VINO SMARTFY AV01B'),
    ]);

    expect(ranked.map((r) => r.item.id)).toEqual(['full', 'partial']);
  });

  // El código de barras es el mismo en la lista de cualquier proveedor,
  // aunque cada uno describa el producto a su manera.
  it('finds the same barcode across suppliers whatever the description says', () => {
    const ranked = rankCatalogSearch('7891234567890', [
      entry('a', 'ABRIDOR DE VINO', { barcode: '7891234567890' }),
      entry('b', 'SACACORCHOS ELECT. 10W', {
        supplierId: 'sup-b',
        barcode: '7891234567890',
      }),
      entry('c', 'Otro producto', { barcode: '1111111111111' }),
    ]);

    expect(ranked.map((r) => r.item.id).sort()).toEqual(['a', 'b']);
    expect(ranked.every((r) => r.score === 1)).toBe(true);
  });

  it('finds an item by the code its supplier uses', () => {
    const ranked = rankCatalogSearch('332726', [
      entry('a', 'ABRIDOR DE VINO', { supplierSku: '332726' }),
      entry('b', 'ADAPTADOR', { supplierSku: '424447' }),
    ]);

    expect(ranked.map((r) => r.item.id)).toEqual(['a']);
  });

  it('keeps a few results per supplier', () => {
    const many = Array.from({ length: 12 }, (_, n) =>
      entry(`a-${n}`, `Abridor de vino modelo ${n}`),
    );

    expect(rankCatalogSearch('abridor vino', many)).toHaveLength(8);
  });

  it('returns nothing for an empty search', () => {
    expect(rankCatalogSearch('   ', [entry('a', 'Abridor')])).toEqual([]);
  });
});

// Cada proveedor describe el mismo producto a su manera, y el sistema solo
// sabe que dos ítems son el mismo producto cuando alguien los vincula. Esto
// propone candidatos por parecido de texto; el vínculo lo confirma una persona.

const MIN_WORD = 4;
const MIN_SCORE = 0.5;
const MAX_PER_SUPPLIER = 3;

function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Palabras que identifican al producto: las de 4 letras o más y los códigos
 * cortos con números (modelos, medidas). "de", "tv", "43" solos no distinguen.
 */
export function productTokens(product: {
  name: string;
  model: string | null;
}): string[] {
  const meaningful = words(`${product.name} ${product.model ?? ''}`).filter(
    (word) =>
      word.length >= MIN_WORD || (/\d/.test(word) && /[a-z]/.test(word)),
  );
  return [...new Set(meaningful)];
}

export interface LinkSuggestion<T> {
  item: T;
  /** Parte de las palabras del producto que aparecen en el ítem (0 a 1). */
  score: number;
}

export function rankLinkSuggestions<
  T extends { supplierId: string; description: string },
>(
  product: { name: string; model: string | null },
  items: readonly T[],
): LinkSuggestion<T>[] {
  const tokens = productTokens(product);
  if (tokens.length === 0) return [];
  // Con una sola palabra en común (suele ser la marca) no se propone nada,
  // salvo que el producto se identifique con una sola palabra.
  const minMatches = Math.min(2, tokens.length);

  const perSupplier = new Map<string, number>();
  return items
    .map((item) => {
      const found = new Set(words(item.description));
      const matches = tokens.filter((token) => found.has(token)).length;
      return { item, matches, score: matches / tokens.length };
    })
    .filter(({ matches, score }) => matches >= minMatches && score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .filter(({ item }) => {
      const count = (perSupplier.get(item.supplierId) ?? 0) + 1;
      perSupplier.set(item.supplierId, count);
      return count <= MAX_PER_SUPPLIER;
    })
    .map(({ item, score }) => ({ item, score }));
}

const MAX_SEARCH_PER_SUPPLIER = 8;

/** Palabras de una búsqueda escrita a mano: se respetan también las cortas. */
export function searchWords(query: string): string[] {
  return [...new Set(words(query))];
}

/**
 * Ítems de catálogo que responden a una búsqueda ("abridor de vino", un
 * código de barras, el código del proveedor), los mejores primero y unos
 * pocos por proveedor. No hace falta que estén vinculados a un producto: es
 * lo que permite comparar listas recién cargadas.
 */
export function rankCatalogSearch<
  T extends {
    supplierId: string;
    description: string;
    supplierSku: string;
    barcode: string | null;
  },
>(query: string, items: readonly T[]): LinkSuggestion<T>[] {
  const wanted = searchWords(query);
  if (wanted.length === 0) return [];
  const code = query.trim().toLowerCase();
  // Buscando varias palabras, una sola en común no alcanza.
  const minMatches = Math.ceil(wanted.length / 2);

  const perSupplier = new Map<string, number>();
  return items
    .map((item) => {
      // Un código exacto (de barras o del proveedor) identifica al ítem sin
      // depender de cómo lo describa cada lista.
      const exactCode =
        item.barcode?.trim().toLowerCase() === code ||
        item.supplierSku.trim().toLowerCase() === code;
      const found = new Set(words(item.description));
      const matches = wanted.filter((word) => found.has(word)).length;
      return {
        item,
        matches,
        score: exactCode ? 1 : matches / wanted.length,
        exactCode,
      };
    })
    .filter(({ matches, exactCode }) => exactCode || matches >= minMatches)
    .sort((a, b) => b.score - a.score)
    .filter(({ item }) => {
      const count = (perSupplier.get(item.supplierId) ?? 0) + 1;
      perSupplier.set(item.supplierId, count);
      return count <= MAX_SEARCH_PER_SUPPLIER;
    })
    .map(({ item, score }) => ({ item, score }));
}

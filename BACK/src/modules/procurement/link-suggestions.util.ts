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

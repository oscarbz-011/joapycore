// Una búsqueda puede encontrar varios ítems en la lista de cada proveedor.
// Para comparar hay que tomar el MISMO producto en todas: el primero de cada
// lista no alcanza, porque "adaptador" puede ser un adaptador distinto en cada
// una y se terminarían comparando precios de cosas diferentes.

interface Found {
  id: string;
  supplierId: string;
  description: string;
  barcode: string | null;
  /** Qué tan bien responde a lo buscado (0 a 1). */
  score: number;
}

const words = (text: string) =>
  new Set(
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );

/** Parte de las palabras que dos descripciones tienen en común (0 a 1). */
function similarity(a: string, b: string): number {
  const first = words(a);
  const second = words(b);
  const shared = [...first].filter((word) => second.has(word)).length;
  const all = new Set([...first, ...second]).size;
  return all === 0 ? 0 : shared / all;
}

/**
 * El ítem de cada proveedor que se compara mientras nadie elija otro: se parte
 * del que mejor responde a la búsqueda y, en las demás listas, se toma el que
 * es ese mismo producto (por código de barras, o si no por descripción).
 */
export function defaultPicks(results: readonly Found[]): Record<string, string> {
  // Orden propio y estable: el resultado no depende de cómo llegó la lista.
  const ranked = [...results].sort(
    (a, b) =>
      b.score - a.score ||
      a.description.localeCompare(b.description, 'es') ||
      a.supplierId.localeCompare(b.supplierId) ||
      a.id.localeCompare(b.id),
  );
  const reference = ranked[0];
  if (!reference) return {};

  const picks: Record<string, string> = {};
  for (const supplierId of new Set(ranked.map((item) => item.supplierId))) {
    const own = ranked.filter((item) => item.supplierId === supplierId);
    const sameCode = reference.barcode
      ? own.find((item) => item.barcode === reference.barcode)
      : undefined;
    // `own` ya está ordenado: ante el mismo parecido gana el mejor resultado.
    const closest = own.reduce((best, item) =>
      similarity(item.description, reference.description) >
      similarity(best.description, reference.description)
        ? item
        : best,
    );
    picks[supplierId] = (sameCode ?? closest).id;
  }
  return picks;
}

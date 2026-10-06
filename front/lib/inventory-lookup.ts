/** Categoría o marca: listas cortas que se eligen por nombre. */
export interface Lookup {
  id: string;
  name: string;
  isActive: boolean;
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * La entrada que ya tiene ese nombre, si existe. Evita mandar a crear un
 * duplicado (el backend lo rechaza) cuando alcanza con elegir la que ya está.
 */
export function findLookupByName<T extends Lookup>(
  items: readonly T[],
  name: string,
): T | undefined {
  const wanted = normalize(name);
  if (!wanted) return undefined;
  return items.find((item) => normalize(item.name) === wanted);
}

export function activeLookups<T extends Lookup>(
  items: readonly T[],
  selectedId: string,
): T[] {
  return items.filter((item) => item.isActive || item.id === selectedId);
}

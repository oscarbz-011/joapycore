function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (á→a, é→e, ñ→n, etc.)
    .replace(/[^a-z0-9]/g, ''); // keep only alphanumeric
}

/** Builds the base candidate: "jose.benitez" */
export function buildUsernameBase(firstName: string, lastName: string): string {
  return `${normalize(firstName)}.${normalize(lastName)}`;
}

/**
 * Resolves a unique username within the existing set.
 * jose.benitez → jose.benitez2 → jose.benitez3 …
 */
export function resolveUsername(
  base: string,
  takenUsernames: string[],
): string {
  const taken = new Set(takenUsernames);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

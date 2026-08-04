export function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toUpperNorm(str: string): string {
  return str.trim().toUpperCase();
}

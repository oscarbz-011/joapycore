// Mayúscula inicial en cada palabra. Separador = cualquier cosa que no sea
// letra o número (espacio, apóstrofe, guion), igual que initcap() de
// PostgreSQL. No usar /\b\w/: en JavaScript \w no incluye letras acentuadas,
// así que "lópez" quedaba "LóPez" y "ñandú" quedaba "ñAndú".
export function toTitleCase(str: string): string {
  return str
    .trim()
    .toLocaleLowerCase('es')
    .replace(
      /(^|[^\p{L}\p{N}])(\p{L})/gu,
      (_match, sep: string, letter: string) =>
        sep + letter.toLocaleUpperCase('es'),
    );
}

export function toUpperNorm(str: string): string {
  return str.trim().toUpperCase();
}

// Misma validación que el backend (BACK/src/common/utils/ruc.util.ts): se
// repite acá para avisar mientras se escribe, sin esperar al servidor.

/** Dígito verificador del RUC: módulo 11 con pesos de 2 a 11 desde la derecha. */
export function rucCheckDigit(base: string): number {
  let weight = 2;
  let total = 0;
  for (const char of [...base].reverse()) {
    if (weight > 11) weight = 2;
    total += Number(char) * weight;
    weight += 1;
  }
  const rest = total % 11;
  return rest > 1 ? 11 - rest : 0;
}

/** Por qué un RUC no es válido, o null si lo es. Formato: 80012345-6. */
export function rucProblem(value: string): string | null {
  const match = /^(\d{1,8})-(\d)$/.exec(value.trim());
  if (!match) {
    return 'El RUC va con su dígito verificador separado por un guion (ej. 80012345-6)';
  }
  if (rucCheckDigit(match[1]) !== Number(match[2])) {
    return 'El dígito verificador del RUC no es correcto';
  }
  return null;
}

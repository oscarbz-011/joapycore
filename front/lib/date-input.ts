import { todayISODate } from './date';

const SEGMENT_LENGTHS = [2, 2, 4];
const SEPARATORS = new Set(['/', '-', '.', ' ']);
// Con año de dos dígitos: hasta 20 años hacia adelante es de este siglo, si no del anterior (90 → 1990).
const TWO_DIGIT_YEAR_WINDOW = 20;
const MIN_YEAR = 1000;

// La barra final solo aparece si la tipeó el usuario: si la máscara la agregara sola,
// borrarla con retroceso la volvería a poner.
export function maskDateInput(raw: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const segments = ['', '', ''];
  let index = 0;
  for (const char of raw) {
    if (/\d/.test(char)) {
      if (segments[index].length === SEGMENT_LENGTHS[index] && index < 2) index++;
      if (segments[index].length < SEGMENT_LENGTHS[index]) segments[index] += char;
    } else if (SEPARATORS.has(char) && index < 2 && segments[index].length > 0) {
      segments[index] = segments[index].padStart(2, '0');
      index++;
    }
  }
  return segments.slice(0, index + 1).join('/');
}

export function parseDateInput(text: string, today = todayISODate()): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (m[3].length === 2) {
    const currentYear = Number(today.slice(0, 4));
    year += 2000;
    if (year > currentYear + TWO_DIGIT_YEAR_WINDOW) year -= 100;
  }
  if (year < MIN_YEAR) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatDateInput(iso?: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export const YEARS_PER_PAGE = 12;

export function yearPageStart(year: number): number {
  return Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE;
}

// Convierte un entero no negativo a su representación en letras, en español,
// para montos en Guaraníes (sin decimales). Usado en la factura ("TOTAL A
// PAGAR EN LETRAS") y en el recibo de dinero ("la cantidad de GUARANIES").

const UNIDADES = [
  '',
  'UN',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
];
const DIECIS = [
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISEIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
];
const VEINTIS = [
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDOS',
  'VEINTITRES',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISEIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];
const DECENAS = [
  '',
  '',
  'VEINTE',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];
const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

function tresDigitos(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';

  const c = Math.floor(n / 100);
  const resto = n % 100;
  const parts: string[] = [];
  if (c > 0) parts.push(CENTENAS[c]);

  if (resto > 0) {
    if (resto < 10) {
      parts.push(UNIDADES[resto]);
    } else if (resto < 20) {
      parts.push(DIECIS[resto - 10]);
    } else if (resto < 30) {
      // 21-29 se contraen en una sola palabra ("veinticinco"), a diferencia
      // de las demás decenas ("sesenta Y tres")
      parts.push(VEINTIS[resto - 20]);
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      parts.push(u > 0 ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }

  return parts.join(' ');
}

function grupoDeMiles(n: number, singular: string, plural: string): string {
  if (n === 0) return '';
  if (n === 1) return singular;
  return `${tresDigitos(n)} ${plural}`;
}

export function numberToWordsEs(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return 'CERO';

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const parts = [
    grupoDeMiles(millones, 'UN MILLON', 'MILLONES'),
    // "UN MIL" (no "MIL" a secas) para 1.000 — así lo escriben los recibos
    // y facturas de referencia, aunque el español general diría solo "mil".
    grupoDeMiles(miles, 'UN MIL', 'MIL'),
    tresDigitos(resto),
  ].filter(Boolean);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

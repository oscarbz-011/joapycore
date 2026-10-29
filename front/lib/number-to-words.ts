const UNITS = [
  '', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE',
  'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS',
  'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
];
const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const HUNDREDS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
];

function belowThousand(n: number): string {
  if (n === 100) return 'CIEN';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let tail = '';
  if (rest < 30) tail = UNITS[rest];
  else {
    const unit = rest % 10;
    tail = TENS[Math.floor(rest / 10)] + (unit ? ` Y ${UNITS[unit]}` : '');
  }
  return [HUNDREDS[hundreds], tail].filter(Boolean).join(' ');
}

function belowMillion(n: number): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = thousands === 0 ? '' : thousands === 1 ? 'MIL' : `${belowThousand(thousands)} MIL`;
  return [head, belowThousand(rest)].filter(Boolean).join(' ');
}

/**
 * Un monto entero en letras, en mayúsculas, como se escribe en una factura
 * ("UN MILLÓN DOSCIENTOS MIL"). Los decimales se descartan: el guaraní no los usa.
 */
export function numberToWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'CERO';
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  let head = '';
  if (millions === 1) head = 'UN MILLÓN';
  else if (millions > 1) head = `${belowMillion(millions)} MILLONES`;
  return [head, belowMillion(rest)].filter(Boolean).join(' ');
}

/** Total en letras para la factura: "GUARANÍES DOSCIENTOS VEINTE MIL". */
export function guaraniesInWords(value: number): string {
  return `GUARANÍES ${numberToWords(value)}`;
}

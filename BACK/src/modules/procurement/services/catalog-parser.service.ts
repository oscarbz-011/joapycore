import { BadRequestException, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import { Workbook, type Row } from 'exceljs';

export interface ParsedCatalogRow {
  supplierSku: string;
  description: string;
  price: number | null;
  supplierUnit: string | null;
  conversionFactor: number | null;
}

export interface RowError {
  /** Número de fila del archivo, tal como lo ve el usuario en Excel. */
  row: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedCatalogRow[];
  errors: RowError[];
}

// Encabezados aceptados por columna, en minúscula y sin acentos. Se aceptan
// varios alias porque cada proveedor rotula distinto y obligar a un formato
// exacto haría que la importación falle por el nombre de una columna.
const HEADER_ALIASES: Record<keyof ParsedCatalogRow, string[]> = {
  supplierSku: [
    'codigo',
    'codigo proveedor',
    'cod',
    'sku',
    'referencia',
    'ref',
  ],
  description: ['descripcion', 'detalle', 'producto', 'articulo', 'nombre'],
  price: ['precio', 'precio unitario', 'costo', 'importe', 'valor'],
  supplierUnit: ['unidad', 'um', 'unidad de medida', 'presentacion'],
  conversionFactor: [
    'factor',
    'factor conversion',
    'equivalencia',
    'cantidad por unidad',
  ],
};

// Una celda de exceljs puede ser texto, número, fecha, fórmula ({result}),
// hipervínculo ({text}) o texto enriquecido ({richText}). Un String() directo
// sobre esos objetos devuelve "[object Object]" y lo importaría como si fuera
// el dato, así que cada forma se desarma explícitamente y lo desconocido cae
// en cadena vacía.
function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const cell = value as {
      result?: unknown;
      text?: unknown;
      richText?: { text?: unknown }[];
      hyperlink?: unknown;
    };
    if (Array.isArray(cell.richText)) {
      return cell.richText
        .map((part) => toText(part?.text))
        .join('')
        .trim();
    }
    if ('result' in cell) return toText(cell.result);
    if ('text' in cell) return toText(cell.text);
  }
  return '';
}

function normalize(value: unknown): string {
  return (
    toText(value)
      .toLowerCase()
      .normalize('NFD')
      // Saca los acentos: "Descripción" y "Descripcion" son la misma columna.
      .replace(/[\u0300-\u036f]/g, '')
  );
}

// Las planillas traen el precio como número, como texto con separador de miles
// ("1.250.000") o con coma decimal ("1250,50"). Devuelve null si no hay nada
// parseable, para distinguir "sin precio" de "precio cero".
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const raw = toText(value);
  if (!raw) return null;

  // El signo se saca antes de limpiar, porque el guion también aparece dentro
  // de códigos y no siempre significa negativo.
  const negative = /^-/.test(raw);
  // Sacar símbolos y texto ("Gs. 45.000" → ". 45.000" → "45.000"): quedan solo
  // dígitos y separadores, sin los que hayan quedado sueltos en los extremos.
  const cleaned = raw
    .replace(/[^\d.,]/g, '')
    .replace(/^[.,]+/, '')
    .replace(/[.,]+$/, '');
  // Sin un solo dígito no hay número que interpretar ("ochenta mil"). Devolver
  // 0 acá sería peor que fallar: entraría como precio cero sin que nadie lo vea.
  if (!/\d/.test(cleaned)) return null;

  // Con coma: la coma es el separador decimal y los puntos son de miles.
  // Sin coma: los puntos son de miles solo si el patrón es 1.250.000 —
  // "12.5" es un decimal.
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(cleaned)
      ? cleaned.replace(/\./g, '')
      : cleaned;

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function cellText(row: Row, col: number | undefined): string {
  if (!col) return '';
  return toText(row.getCell(col).value);
}

/**
 * Convierte la lista de precios del proveedor (.xlsx o .csv) en filas listas
 * para importar. No aborta el archivo entero ante una fila mala: junta los
 * errores por número de fila para poder mostrarle al usuario qué corregir y
 * seguir importando el resto (ver plan-modulo-compras.md, Fase 1.2).
 */
@Injectable()
export class CatalogParserService {
  async parse(buffer: Buffer, filename: string): Promise<ParseResult> {
    const workbook = new Workbook();
    const isCsv = filename.toLowerCase().endsWith('.csv');

    try {
      if (isCsv) {
        await workbook.csv.read(Readable.from(buffer.toString('utf8')));
      } else {
        // exceljs declara `Buffer` contra su propia copia de @types/node, que
        // no es el `Buffer<ArrayBufferLike>` genérico del proyecto. Se toma el
        // tipo del propio parámetro en vez de castear a ciegas.
        type XlsxLoadArg = Parameters<Workbook['xlsx']['load']>[0];
        await workbook.xlsx.load(buffer as unknown as XlsxLoadArg);
      }
    } catch {
      throw new BadRequestException(
        'No se pudo leer el archivo. Tiene que ser un .xlsx o .csv válido.',
      );
    }

    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount === 0) {
      throw new BadRequestException('El archivo está vacío');
    }

    const columns = this.mapHeaders(sheet.getRow(1));
    if (!columns.supplierSku || !columns.description) {
      throw new BadRequestException(
        'No se encontraron las columnas mínimas. La primera fila tiene que tener al menos "Código" y "Descripción".',
      );
    }

    const rows: ParsedCatalogRow[] = [];
    const errors: RowError[] = [];
    const seen = new Set<string>();

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const supplierSku = cellText(row, columns.supplierSku);
      const description = cellText(row, columns.description);

      // Fila totalmente vacía: es relleno del final del archivo, no un error.
      if (!supplierSku && !description) continue;

      if (!supplierSku) {
        errors.push({ row: i, message: 'Falta el código del proveedor' });
        continue;
      }
      if (!description) {
        errors.push({ row: i, message: 'Falta la descripción' });
        continue;
      }
      // El upsert es por (proveedor, código): dos filas con el mismo código en
      // el mismo archivo se pisarían entre sí sin que nadie se entere.
      if (seen.has(supplierSku)) {
        errors.push({
          row: i,
          message: `Código repetido en el archivo: ${supplierSku}`,
        });
        continue;
      }

      const priceRaw = cellText(row, columns.price);
      const price = parseNumber(priceRaw);
      if (priceRaw && price === null) {
        errors.push({ row: i, message: `Precio inválido: "${priceRaw}"` });
        continue;
      }
      if (price !== null && price < 0) {
        errors.push({ row: i, message: 'El precio no puede ser negativo' });
        continue;
      }

      const factor = parseNumber(cellText(row, columns.conversionFactor));

      seen.add(supplierSku);
      rows.push({
        supplierSku,
        description,
        price,
        supplierUnit: cellText(row, columns.supplierUnit) || null,
        conversionFactor: factor && factor > 0 ? factor : null,
      });
    }

    return { rows, errors };
  }

  private mapHeaders(
    headerRow: Row,
  ): Partial<Record<keyof ParsedCatalogRow, number>> {
    const columns: Partial<Record<keyof ParsedCatalogRow, number>> = {};

    headerRow.eachCell((cell, colNumber) => {
      const header = normalize(cell.value);
      if (!header) return;
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        const key = field as keyof ParsedCatalogRow;
        if (columns[key]) continue;
        if (aliases.includes(header)) columns[key] = colNumber;
      }
    });

    return columns;
  }
}

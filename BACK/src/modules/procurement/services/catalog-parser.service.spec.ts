/// <reference types="jest" />

import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { CatalogParserService } from './catalog-parser.service';

// Genera un .xlsx real en memoria: probar el parser contra un mock de exceljs
// no diría nada sobre si sabe leer una planilla de verdad.
async function xlsxBuffer(rows: unknown[][]): Promise<Buffer> {
  const wb = new Workbook();
  const sheet = wb.addWorksheet('Lista');
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('CatalogParserService', () => {
  let service: CatalogParserService;

  beforeEach(() => {
    service = new CatalogParserService();
  });

  const HEADERS = ['Codigo', 'Descripcion', 'Precio', 'Unidad', 'Factor'];

  it('parses a normal price list', async () => {
    const buf = await xlsxBuffer([
      HEADERS,
      ['TAB-18', 'Tablero MDF 18mm', 120000, 'unidad', 1],
      ['TOR-6', 'Tornillo 6x40', 350, 'caja', 100],
    ]);

    const { rows, errors } = await service.parse(buf, 'lista.xlsx');

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        supplierSku: 'TAB-18',
        description: 'Tablero MDF 18mm',
        price: 120000,
        supplierUnit: 'unidad',
        conversionFactor: 1,
      },
      {
        supplierSku: 'TOR-6',
        description: 'Tornillo 6x40',
        price: 350,
        supplierUnit: 'caja',
        conversionFactor: 100,
      },
    ]);
  });

  // Cada proveedor rotula distinto: exigir un encabezado exacto haría que la
  // importación falle por el nombre de una columna.
  it.each([
    ['Código', 'Descripción'],
    ['SKU', 'Detalle'],
    ['REFERENCIA', 'ARTICULO'],
    ['cod', 'producto'],
  ])('accepts "%s"/"%s" as headers', async (codeHeader, descHeader) => {
    const buf = await xlsxBuffer([
      [codeHeader, descHeader, 'Precio'],
      ['A-1', 'Algo', 100],
    ]);

    const { rows, errors } = await service.parse(buf, 'lista.xlsx');

    expect(errors).toEqual([]);
    expect(rows[0].supplierSku).toBe('A-1');
  });

  // Los precios llegan como texto con formato paraguayo más veces que como
  // número: "1.250.000" son 1,25 millones, no 1,25.
  it.each([
    ['1.250.000', 1250000],
    ['1250,50', 1250.5],
    ['1.250,50', 1250.5],
    ['12.5', 12.5],
    ['Gs. 45.000', 45000],
  ])('reads the price "%s" as %s', async (raw, expected) => {
    const buf = await xlsxBuffer([HEADERS, ['A-1', 'Algo', raw]]);

    const { rows } = await service.parse(buf, 'lista.xlsx');

    expect(rows[0].price).toBe(expected);
  });

  it('distinguishes "sin precio" from "precio cero"', async () => {
    const buf = await xlsxBuffer([
      HEADERS,
      ['A-1', 'Sin precio', ''],
      ['A-2', 'Gratis', 0],
    ]);

    const { rows } = await service.parse(buf, 'lista.xlsx');

    expect(rows[0].price).toBeNull();
    expect(rows[1].price).toBe(0);
  });

  // Lo central de la Fase 1: una fila mala no puede tumbar el archivo entero.
  it('rejects the bad rows and keeps the good ones', async () => {
    const buf = await xlsxBuffer([
      HEADERS,
      ['A-1', 'Buena', 100],
      ['', 'Sin código', 100],
      ['A-3', '', 100],
      ['A-4', 'Precio roto', 'ochenta mil'],
      ['A-5', 'Otra buena', 200],
    ]);

    const { rows, errors } = await service.parse(buf, 'lista.xlsx');

    expect(rows.map((r) => r.supplierSku)).toEqual(['A-1', 'A-5']);
    expect(errors).toEqual([
      { row: 3, message: 'Falta el código del proveedor' },
      { row: 4, message: 'Falta la descripción' },
      { row: 5, message: 'Precio inválido: "ochenta mil"' },
    ]);
  });

  // El upsert es por (proveedor, código): dos filas con el mismo código se
  // pisarían en silencio.
  it('flags a code repeated inside the same file', async () => {
    const buf = await xlsxBuffer([
      HEADERS,
      ['A-1', 'Primera', 100],
      ['A-1', 'Segunda', 200],
    ]);

    const { rows, errors } = await service.parse(buf, 'lista.xlsx');

    expect(rows).toHaveLength(1);
    expect(errors[0]).toEqual({
      row: 3,
      message: 'Código repetido en el archivo: A-1',
    });
  });

  it('ignores trailing empty rows instead of reporting them as errors', async () => {
    const buf = await xlsxBuffer([
      HEADERS,
      ['A-1', 'Algo', 100],
      [],
      ['', '', ''],
    ]);

    const { rows, errors } = await service.parse(buf, 'lista.xlsx');

    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it('parses a .csv the same way', async () => {
    const csv = 'Codigo,Descripcion,Precio\nTAB-18,Tablero MDF,120000\n';

    const { rows, errors } = await service.parse(Buffer.from(csv), 'lista.csv');

    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ supplierSku: 'TAB-18', price: 120000 });
  });

  it('rejects a file without the minimum columns', async () => {
    const buf = await xlsxBuffer([
      ['Fecha', 'Vendedor'],
      ['hoy', 'Juan'],
    ]);

    await expect(service.parse(buf, 'lista.xlsx')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a file that is not a spreadsheet', async () => {
    await expect(
      service.parse(Buffer.from('esto no es una planilla'), 'lista.xlsx'),
    ).rejects.toThrow(/no se pudo leer el archivo/i);
  });
});

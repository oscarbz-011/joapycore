import type { PdfTableVariable } from '../pdf/tiptap-to-html.converter';
import { unflattenVariables } from './docx-variables.util';

describe('unflattenVariables', () => {
  it('nests dotted keys into an object tree', () => {
    const result = unflattenVariables({
      'cliente.nombre': 'Juan',
      'cliente.documento': 'CI 1234567',
      'tenant.razonSocial': 'Acme S.A.',
    });

    expect(result).toEqual({
      cliente: { nombre: 'Juan', documento: 'CI 1234567' },
      tenant: { razonSocial: 'Acme S.A.' },
    });
  });

  it('defaults nullish flat values to an empty string', () => {
    const result = unflattenVariables({
      'cliente.nombre': undefined as unknown as string,
    });
    expect(result).toEqual({ cliente: { nombre: '' } });
  });

  it('handles a flat (non-dotted) key at the root', () => {
    const result = unflattenVariables({ total: '100.000' });
    expect(result).toEqual({ total: '100.000' });
  });

  it('converts a table variable into an array of positional col1..colN objects', () => {
    const table: PdfTableVariable = {
      headers: ['Producto', 'Cantidad'],
      rows: [
        ['Heladera', '1'],
        ['Cocina', '2'],
      ],
    };

    const result = unflattenVariables({}, { 'factura.items': table });

    expect(result).toEqual({
      factura: {
        items: [
          { col1: 'Heladera', col2: '1' },
          { col1: 'Cocina', col2: '2' },
        ],
      },
    });
  });

  it('defaults nullish table cells to an empty string', () => {
    const table: PdfTableVariable = {
      headers: ['A', 'B'],
      rows: [['x', undefined as unknown as string]],
    };

    const result = unflattenVariables({}, { items: table });
    expect(result).toEqual({ items: [{ col1: 'x', col2: '' }] });
  });

  it('merges flat variables and table variables sharing a common parent path', () => {
    const table: PdfTableVariable = { headers: ['Cuota'], rows: [['1']] };

    const result = unflattenVariables(
      { 'credito.tasaInteres': '5%' },
      { 'credito.cuotas': table },
    );

    expect(result).toEqual({
      credito: {
        tasaInteres: '5%',
        cuotas: [{ col1: '1' }],
      },
    });
  });
});

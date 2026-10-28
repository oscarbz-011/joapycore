import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoicePdfAction, type BillingSeries, type VoidedSheet } from './api/billing';
import { layoutProblem } from './preprinted-layout-fields';
import { STANDARD_PREPRINTED_LAYOUT } from './preprinted-form';

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  data: {} as Record<string, unknown>,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    jwtPayload: { sub: 'me', tenantId: 'tenant-1', permissions: state.permissions, activeModules: ['billing'] },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: state.data[queryKey[queryKey.length - 1]],
    isLoading: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ isPending: false, isError: false, mutate: () => undefined }),
}));

const { PreprintedSheetPanel } = await import('@/components/billing/preprinted-sheet-panel');
const { PreprintedLayoutEditor } = await import('@/components/billing/preprinted-layout-editor');
const { VoidedSheets } = await import('@/components/billing/voided-sheets');

function render<P extends object>(type: ComponentType<P>, props: P): string {
  return renderToStaticMarkup(createElement(type, props));
}

const SHEET_INVOICE = {
  id: 'inv-1',
  invoicePrefix: '001-002-',
  invoiceNumber: '0000041',
  formPrintCount: 0,
  formPrintedAt: null,
  physicalScan: null,
};

const SERIES: BillingSeries = {
  id: 'series-1',
  branchId: 'branch-1',
  documentType: 'INVOICE',
  modality: 'PREPRINTED',
  timbrado: '12345678',
  validFrom: '2026-01-01',
  validUntil: '2026-12-31',
  establecimiento: '001',
  puntoExpedicion: '002',
  serieCode: '',
  rangeFrom: 1,
  rangeTo: 500,
  nextNumber: 42,
  isActive: true,
  printLayout: STANDARD_PREPRINTED_LAYOUT,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  branch: { id: 'branch-1', name: 'Central' },
  _count: { invoices: 3 },
};

beforeEach(() => {
  state.permissions = [];
  state.data = {};
});

describe('talonario sheet of an invoice', () => {
  it('lets whoever issues print on the sheet, void it and attach the scan', () => {
    state.permissions = ['billing:issue'];
    const html = render(PreprintedSheetPanel, { invoice: SHEET_INVOICE });

    expect(html).toContain('Hoja N° <span class="font-mono">001-002-0000041</span>');
    expect(html).toContain('Todavía no se imprimió sobre la hoja');
    expect(html).toContain('Imprimir sobre la hoja');
    expect(html).toContain('La hoja salió mal');
    expect(html).toContain('Adjuntar escaneo o foto');
  });

  it('shows how many times it was printed and the attached scan', () => {
    const html = render(PreprintedSheetPanel, {
      invoice: {
        ...SHEET_INVOICE,
        formPrintCount: 2,
        formPrintedAt: '2026-06-15T15:00:00.000Z',
        physicalScan: { id: 'file-1', originalName: 'factura-41.jpg', mimeType: 'image/jpeg' },
      },
    });

    expect(html).toContain('Impresa 2 veces, la última el 15/06/26');
    expect(html).toContain('factura-41.jpg');
  });

  it('only shows the data to someone who cannot issue', () => {
    const html = render(PreprintedSheetPanel, { invoice: SHEET_INVOICE });
    expect(html).not.toContain('Imprimir sobre la hoja');
    expect(html).not.toContain('La hoja salió mal');
    expect(html).not.toContain('Adjuntar escaneo');
  });

  it('has no PDF to print or regenerate', () => {
    expect(invoicePdfAction({ status: 'ISSUED', pdfFileId: null, modality: 'PREPRINTED' })).toBeNull();
    expect(invoicePdfAction({ status: 'ISSUED', pdfFileId: null, modality: 'SELF_PRINTED' })).toBe('retry');
  });
});

describe('print layout of a talonario series', () => {
  it('shows every position with the current value and the test print', () => {
    state.permissions = ['billing:series:manage'];
    const html = render(PreprintedLayoutEditor, { series: SERIES, canManage: true });

    expect(html).toContain('Ancho de la hoja (mm)');
    expect(html).toContain('value="216"');
    expect(html).toContain('Nombre o razón social');
    expect(html).toContain('Gravadas 10% (borde derecho)');
    expect(html).toContain('Imprimir prueba');
    expect(html).toContain('Guardar diseño');
    expect(html).toContain('Volver al diseño estándar');
  });

  it('lets anyone print a test but only managers save', () => {
    const html = render(PreprintedLayoutEditor, { series: SERIES, canManage: false });
    expect(html).toContain('Imprimir prueba');
    expect(html).not.toContain('Guardar diseño');
  });

  it.each([
    [{ pageWidth: 20 }, 'El ancho de la hoja va de 50 a 500 mm'],
    [{ fontSize: 30 }, 'El tamaño de letra va de 6 a 16 pt'],
    [{ offsetX: 40 }, 'El corrimiento va de -30 a 30 mm'],
    [{ items: { ...STANDARD_PREPRINTED_LAYOUT.items, maxLines: 2.5 } }, 'Las líneas por hoja van de 1 a 60'],
    [{ date: { x: Number.NaN, y: 10 } }, 'Las posiciones van de 0 a 500 mm'],
  ])('rejects %o', (overrides, message) => {
    expect(layoutProblem({ ...STANDARD_PREPRINTED_LAYOUT, ...overrides })).toBe(message);
  });

  it('accepts the standard layout', () => {
    expect(layoutProblem(STANDARD_PREPRINTED_LAYOUT)).toBeNull();
  });
});

describe('voided sheets of a talonario', () => {
  const sheet: VoidedSheet = {
    id: 'v-1',
    sequential: 41,
    reason: 'Se trabó el papel',
    createdAt: '2026-06-15T15:00:00.000Z',
    voidedById: 'me',
    invoice: { id: 'inv-1', invoicePrefix: '001-002-', invoiceNumber: '0000041' },
    scanFile: { id: 'file-1', originalName: 'hoja-41.jpg', mimeType: 'image/jpeg' },
  };

  it('lists each voided sheet with its reason, invoice and scan', () => {
    state.data = { voided: [sheet] };
    const html = render(VoidedSheets, { series: SERIES, canManage: true });

    expect(html).toContain('>41<');
    expect(html).toContain('Se trabó el papel');
    expect(html).toContain('001-002-0000041');
    expect(html).toContain('Ver');
    expect(html).toContain('Inutilizar una hoja sin factura');
  });

  it('says when no sheet was voided', () => {
    state.data = { voided: [] };
    expect(render(VoidedSheets, { series: SERIES, canManage: false })).toContain(
      'No hay hojas inutilizadas en esta serie.',
    );
  });
});

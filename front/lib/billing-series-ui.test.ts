import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingSeries, BillingSeriesOption } from './api/billing';

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  series: [] as unknown[],
  loading: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
  useParams: () => ({ id: 'series-1' }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    jwtPayload: { sub: 'me', tenantId: 'tenant-1', permissions: state.permissions, activeModules: ['billing'] },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.loading ? undefined : state.series, isLoading: state.loading, error: null }),
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ isPending: false, mutate: () => undefined }),
}));

const { SeriesNumberingFields } = await import('@/components/billing/series-numbering-fields');
const { default: BillingSeriesPage } = await import('@/app/(dashboard)/dashboard/settings/billing-series/page');

function makeSeries(overrides: Partial<BillingSeries> = {}): BillingSeries {
  return {
    id: 'series-1',
    branchId: 'branch-1',
    documentType: 'INVOICE',
    modality: 'PREPRINTED',
    timbrado: '12345678',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2099-12-31T00:00:00.000Z',
    establecimiento: '001',
    puntoExpedicion: '002',
    serieCode: '',
    rangeFrom: 1,
    rangeTo: 500,
    nextNumber: 42,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    branch: { id: 'branch-1', name: 'Central' },
    _count: { invoices: 0 },
    ...overrides,
  };
}

const option = (overrides: Partial<BillingSeriesOption> = {}): BillingSeriesOption => ({
  ...makeSeries(),
  problem: null,
  ...overrides,
});

function fields(options: BillingSeriesOption[], props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(SeriesNumberingFields, {
      options,
      isLoading: false,
      seriesId: options.length === 1 ? options[0].id : '',
      onSeriesChange: () => undefined,
      documentNumber: '',
      onDocumentNumberChange: () => undefined,
      ...props,
    }),
  );
}

beforeEach(() => {
  state.permissions = [];
  state.series = [];
  state.loading = false;
});

describe('SeriesNumberingFields', () => {
  it('asks for the talonario number with the valid range of the only series', () => {
    const html = fields([option()]);
    expect(html).toContain('001-002 · Talonario de imprenta · Timbrado 12345678');
    expect(html).toContain('Número del talonario');
    expect(html).toContain('Rango del talonario: 1 a 500. Siguiente esperado: 42.');
  });

  it('does not ask for a number when the system numbers the invoice', () => {
    const html = fields([option({ modality: 'SELF_PRINTED' })]);
    expect(html).toContain('Impresión propia');
    expect(html).not.toContain('Número del talonario');
  });

  it('makes the user choose when the branch has two valid series', () => {
    const html = fields([option(), option({ id: 'series-2', puntoExpedicion: '003' })]);
    expect(html).toContain('— Elegí la serie —');
  });

  it('explains why the only series cannot be used and links to the series', () => {
    const html = fields([option({ problem: 'El timbrado venció el 31/12/2025' })]);
    expect(html).toContain('role="alert"');
    expect(html).toContain('El timbrado venció el 31/12/2025');
    expect(html).toContain('href="/dashboard/settings/billing-series"');
  });

  it('shows the error of an out-of-range number', () => {
    const html = fields([option()], {
      documentNumber: '900',
      documentNumberError: 'Fuera del rango del talonario (1 a 500)',
    });
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('Fuera del rango del talonario (1 a 500)');
  });
});

describe('Series de facturación', () => {
  const page = () => renderToStaticMarkup(createElement(BillingSeriesPage));

  it('explains that there is no billing without a series', () => {
    expect(page()).toContain('Sin una serie vigente no se puede facturar.');
  });

  it('only offers to create series to whoever can manage them', () => {
    expect(page()).not.toContain('Nueva serie');
    state.permissions = ['billing:series:manage'];
    expect(page()).toContain('Nueva serie');
  });

  it('lists each datum in its own column', () => {
    state.series = [makeSeries({ _count: { invoices: 3 } })];
    const html = page();
    for (const header of ['Sucursal', 'Modalidad', 'Timbrado', 'Vigencia hasta', 'Próximo número', 'Estado']) {
      expect(html).toContain(header);
    }
    expect(html).toContain('Central');
    expect(html).toContain('Talonario de imprenta');
    expect(html).toContain('Vigente');
  });
});

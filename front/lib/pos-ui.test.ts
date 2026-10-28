import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingSeries } from './api/billing';
import type { ActivePosSession, PosInvoiceSeries, PosTerminal } from './api/pos';
import type { Customer } from './api/sales';
import { STANDARD_PREPRINTED_LAYOUT } from './preprinted-form';

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  data: {} as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
  useParams: () => ({ id: 'terminal-1' }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    jwtPayload: { sub: 'me', tenantId: 'tenant-1', permissions: state.permissions, activeModules: ['pos', 'billing'] },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: state.data[queryKey[0]],
    isLoading: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ isPending: false, isError: false, mutate: () => undefined }),
}));

const { default: PosTerminalsPage } = await import('@/app/(dashboard)/dashboard/settings/pos-terminals/page');
const { PosTerminalForm } = await import('@/app/(dashboard)/dashboard/settings/pos-terminals/_form');
const { PosCustomerPicker } = await import('@/components/pos/pos-customer-picker');
const { default: PosPage } = await import('@/app/(dashboard)/dashboard/pos/page');

function makeTerminal(overrides: Partial<PosTerminal> = {}): PosTerminal {
  return {
    id: 'terminal-1',
    branchId: 'branch-1',
    name: 'Caja 1',
    isActive: true,
    invoiceSeriesId: null,
    printFormat: 'A4',
    thermalPaperReportFileId: null,
    thermalPaperConservation: null,
    branch: { id: 'branch-1', name: 'Central' },
    thermalPaperReport: null,
    ...overrides,
  };
}

const SERIES: BillingSeries = {
  id: 'series-1',
  branchId: 'branch-1',
  documentType: 'INVOICE',
  modality: 'PREPRINTED',
  timbrado: '12345678',
  validFrom: '2026-01-01',
  validUntil: '2099-12-31',
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
  _count: { invoices: 0 },
};

const POS_SERIES: PosInvoiceSeries = {
  id: 'series-1',
  branchId: 'branch-1',
  modality: 'PREPRINTED',
  establecimiento: '001',
  puntoExpedicion: '002',
  timbrado: '12345678',
  rangeFrom: 1,
  rangeTo: 500,
  nextNumber: 42,
  isInvoiceSeries: true,
  problem: null,
};

function makeSession(invoiceSeries: PosInvoiceSeries | null): ActivePosSession {
  return {
    id: 'session-1',
    terminalId: 'terminal-1',
    cashierId: 'me',
    status: 'OPEN',
    openingCash: 0,
    closingCash: null,
    expectedCash: null,
    difference: null,
    openedAt: '2026-06-15T12:00:00.000Z',
    closedAt: null,
    notes: null,
    terminal: {
      id: 'terminal-1',
      name: 'Caja 1',
      branchId: 'branch-1',
      invoiceSeriesId: invoiceSeries?.id ?? null,
      printFormat: 'A4',
      thermalPaperConservation: null,
    },
    cashier: { id: 'me', firstName: 'Ana', lastName: 'Gómez' },
    invoiceSeries,
  };
}

function render<P extends object>(type: ComponentType<P>, props: P): string {
  return renderToStaticMarkup(createElement(type, props));
}

beforeEach(() => {
  state.permissions = [];
  state.data = {};
});

describe('cash registers settings', () => {
  it('warns about a cash register that cannot charge because it has no invoice series', () => {
    state.data = {
      'pos-terminals': [makeTerminal(), makeTerminal({ id: 'terminal-2', name: 'Caja 2', invoiceSeriesId: 'series-1', printFormat: 'THERMAL_80' })],
      branches: [{ id: 'branch-1', name: 'Central' }],
    };
    const html = render(PosTerminalsPage, {});

    expect(html).toContain('Sin serie: no puede cobrar');
    expect(html).toContain('Asignada');
    expect(html).toContain('Térmica 80 mm');
  });

  it('explains that thermal paper needs the durability report', () => {
    state.data = { 'billing-series': [SERIES] };
    const html = render(PosTerminalForm, { terminal: makeTerminal(), onDone: () => undefined });

    expect(html).toContain('RG 27/19');
    expect(html).toContain('Informe de durabilidad del papel térmico');
  });

  it('shows the uploaded report and does not ask for it again', () => {
    state.data = { 'billing-series': [SERIES] };
    const html = render(PosTerminalForm, {
      terminal: makeTerminal({
        printFormat: 'THERMAL_80',
        thermalPaperReportFileId: 'file-1',
        thermalPaperConservation: 'Lejos del calor',
        thermalPaperReport: { id: 'file-1', originalName: 'informe-papel.pdf' },
      }),
      onDone: () => undefined,
    });

    expect(html).toContain('informe-papel.pdf');
    expect(html).not.toContain('se habilita al cargar');
  });

  it('tells when the branch has no invoice series to assign', () => {
    state.data = { 'billing-series': [{ ...SERIES, branchId: 'branch-2' }] };
    const html = render(PosTerminalForm, { terminal: makeTerminal(), onDone: () => undefined });

    expect(html).toContain('no tiene series de facturas activas');
  });
});

describe('invoice buyer at the cash register', () => {
  it('invoices to "Sin Nombre" until a customer is chosen', () => {
    state.permissions = ['customers:create'];
    const html = render(PosCustomerPicker, { value: null, onChange: () => undefined });

    expect(html).toContain('Sin Nombre');
    expect(html).toContain('Buscar cliente por nombre, C.I. o RUC');
    expect(html).toContain('Nuevo cliente');
  });

  it('does not offer creating customers without permission', () => {
    expect(render(PosCustomerPicker, { value: null, onChange: () => undefined })).not.toContain('Nuevo cliente');
  });

  it('shows the chosen company with its RUC', () => {
    const company = {
      id: 'c-1',
      firstName: 'TIPS S.A.',
      secondFirstName: null,
      lastName: '',
      secondLastName: null,
      documentType: 'RUC',
      documentNumber: '80069563-1',
      taxpayerType: 'COMPANY',
    } as Customer;
    const html = render(PosCustomerPicker, { value: company, onChange: () => undefined });

    expect(html).toContain('TIPS S.A.');
    expect(html).toContain('RUC 80069563-1');
  });
});

describe('sale screen', () => {
  it('blocks charging when the cash register has no invoice series', () => {
    state.data = { 'pos-active-session': makeSession(null) };
    const html = render(PosPage, {});

    expect(html).toContain('Esta caja no tiene una serie de facturas');
    expect(html).not.toContain('N° de la hoja del talonario');
  });

  it('asks for the talonario page, suggesting the next number', () => {
    state.data = { 'pos-active-session': makeSession(POS_SERIES) };
    const html = render(PosPage, {});

    expect(html).toContain('N° de la hoja del talonario (001-002)');
    expect(html).toContain('value="42"');
    expect(html).toContain('al cobrar se imprimen los datos de la venta sobre ella');
  });

  it('shows why an expired timbrado cannot invoice', () => {
    state.data = { 'pos-active-session': makeSession({ ...POS_SERIES, problem: 'El timbrado venció el 31/12/2025' }) };
    expect(render(PosPage, {})).toContain('El timbrado venció el 31/12/2025');
  });

  it('does not ask for a number with a self-printed series', () => {
    state.data = { 'pos-active-session': makeSession({ ...POS_SERIES, modality: 'SELF_PRINTED' }) };
    const html = render(PosPage, {});

    expect(html).not.toContain('N° de la hoja del talonario');
    expect(html).toContain('Cobrar y facturar');
  });
});

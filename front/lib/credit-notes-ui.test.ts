import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreditNoteDetail, CreditNoteOptions, Invoice } from './api/billing';
import { STANDARD_PREPRINTED_LAYOUT } from './preprinted-form';

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  data: undefined as unknown,
  search: '' as string,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
  useParams: () => ({ id: 'inv-1' }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    jwtPayload: { sub: 'me', tenantId: 'tenant-1', permissions: state.permissions, activeModules: ['billing'] },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.data, isLoading: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ isPending: false, isError: false, error: null, mutate: () => undefined }),
}));

const { SettlementFields, settlementProblem, EMPTY_SETTLEMENT } = await import(
  '@/components/billing/settlement-fields'
);
const { default: CreditNotePage } = await import(
  '@/app/(dashboard)/dashboard/billing/invoices/[id]/credit-note/page'
);
const { default: VoidInvoicePage } = await import(
  '@/app/(dashboard)/dashboard/billing/invoices/[id]/void/page'
);
const { default: CreditNoteDetailPage } = await import(
  '@/app/(dashboard)/dashboard/billing/credit-notes/[id]/page'
);

function render<P extends object>(type: ComponentType<P>, props: P): string {
  return renderToStaticMarkup(createElement(type, props));
}

const SERIES = {
  id: 'series-nc',
  branchId: 'branch-1',
  documentType: 'CREDIT_NOTE',
  modality: 'SELF_PRINTED',
  timbrado: '87654321',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2099-12-31T00:00:00.000Z',
  establecimiento: '001',
  puntoExpedicion: '001',
  serieCode: '',
  rangeFrom: 1,
  rangeTo: 500,
  nextNumber: 7,
  isActive: true,
  printLayout: STANDARD_PREPRINTED_LAYOUT,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  branch: { id: 'branch-1', name: 'Central' },
  _count: { invoices: 0, creditNotes: 0 },
  problem: null,
} as const;

const OPTIONS: CreditNoteOptions = {
  invoice: {
    id: 'inv-1',
    number: '001-002-0000009',
    status: 'ISSUED',
    total: 2_231_500,
    creditedTotal: 0,
    remaining: 2_231_500,
    isCreditSale: false,
  },
  customer: { id: 'c-1', name: 'Maria Perez', creditBalance: 0 },
  balance: { outstanding: 2_231_500, paid: 0 },
  items: [
    {
      invoiceItemId: 'ii-1',
      description: 'Heladera',
      quantity: 2,
      creditableQuantity: 2,
      unitPrice: 1_100_000,
      ivaRate: 10,
      saleOrderItemId: 'soi-1',
      restockable: true,
      isSerialized: true,
      soldSerials: ['SN-1', 'SN-2'],
    },
    {
      invoiceItemId: 'ii-2',
      description: 'Instalación',
      quantity: 1,
      creditableQuantity: 1,
      unitPrice: 31_500,
      ivaRate: 10,
      saleOrderItemId: 'soi-2',
      restockable: false,
      isSerialized: false,
      soldSerials: [],
    },
  ],
  series: [SERIES as never],
};

beforeEach(() => {
  state.permissions = ['billing:cancel'];
  state.data = undefined;
  state.search = '';
});

describe('settlement of money already paid', () => {
  it('offers customer credit only when the invoice has a customer', () => {
    const withCustomer = render(SettlementFields, {
      amount: 100_000,
      customerName: 'Maria Perez',
      value: EMPTY_SETTLEMENT,
      onChange: () => undefined,
    });
    expect(withCustomer).toContain('Gs. 100.000');
    expect(withCustomer).toContain('Queda a favor de Maria Perez');

    const anonymous = render(SettlementFields, {
      amount: 100_000,
      customerName: null,
      value: EMPTY_SETTLEMENT,
      onChange: () => undefined,
    });
    expect(anonymous).toContain('no tiene un cliente identificado');
  });

  it('asks how the money is paid back', () => {
    expect(settlementProblem(EMPTY_SETTLEMENT)).toContain('saldo a favor o se le devuelve');
    expect(settlementProblem({ mode: 'REFUND', method: null, reference: '' })).toContain('cómo se le devuelve');
    expect(settlementProblem({ mode: 'CUSTOMER_CREDIT', method: null, reference: '' })).toBeNull();
  });
});

describe('credit note screen', () => {
  it('shows what can be credited, the items and the series', () => {
    state.data = OPTIONS;
    const html = render(CreditNotePage, {});
    expect(html).toContain('Nota de crédito');
    expect(html).toContain('001-002-0000009');
    expect(html).toContain('Devolución de ítems');
    expect(html).toContain('Heladera');
    expect(html).toContain('No mueve stock');
    expect(html).toContain('El cliente todavía debe');
    expect(html).toContain('Emitir nota de crédito');
  });

  it('starts as a total note when it comes from the void screen', () => {
    state.data = OPTIONS;
    state.search = 'kind=TOTAL';
    const html = render(CreditNotePage, {});
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Total/);
  });

  it('warns that a credited invoice cannot get a total note', () => {
    state.data = { ...OPTIONS, invoice: { ...OPTIONS.invoice, creditedTotal: 100, remaining: 2_231_400 } };
    state.search = 'kind=TOTAL';
    expect(render(CreditNotePage, {})).toContain('acreditá lo que queda por ítems o por importe');
  });

  it('points to the series settings when there is no credit note series', () => {
    state.data = { ...OPTIONS, series: [] };
    expect(render(CreditNotePage, {})).toContain('serie de notas de crédito vigente');
  });

  it('hides the issue button without permission', () => {
    state.permissions = ['billing:read'];
    state.data = OPTIONS;
    expect(render(CreditNotePage, {})).not.toContain('Emitir nota de crédito</button>');
  });
});

describe('void screen', () => {
  const invoice = {
    id: 'inv-1',
    invoiceType: 'SALE',
    status: 'PAID',
    total: 220_000,
    creditedTotal: 0,
    anonymousBuyer: false,
    invoicePrefix: '001-002-',
    invoiceNumber: '0000009',
    saleOrder: { customer: { id: 'c-1', firstName: 'Maria', lastName: 'Perez' } },
  } as unknown as Invoice;

  it('asks for the money of a paid invoice and explains when to void', () => {
    state.data = invoice;
    const html = render(VoidInvoicePage, {});
    expect(html).toContain('Anular factura');
    expect(html).toContain('conserva el original y todas las copias');
    expect(html).toContain('nota de crédito por el total');
    expect(html).toContain('El cliente ya pagó');
  });

  it('sends a credited invoice to the credit note instead', () => {
    state.data = { ...invoice, creditedTotal: 100 };
    const html = render(VoidInvoicePage, {});
    expect(html).toContain('no se puede anular');
    expect(html).toContain('Emitir una nota de crédito');
  });
});

describe('credit note detail', () => {
  const note = {
    id: 'cn-1',
    number: '0000007',
    numberPrefix: '001-001-',
    kind: 'ITEMS',
    reason: 'Devolvió una heladera',
    total: '1100000',
    status: 'ISSUED',
    modality: 'PREPRINTED',
    issuedAt: '2026-10-28T13:00:00.000Z',
    appliedToBalance: '1000000',
    createdAt: '2026-10-28T13:00:00.000Z',
    customer: { id: 'c-1', firstName: 'Maria', lastName: 'Perez', email: null },
    invoice: {
      id: 'inv-1',
      invoicePrefix: '001-002-',
      invoiceNumber: '0000009',
      total: '2200000',
      issuedAt: null,
      status: 'ISSUED',
      saleOrder: null,
    },
    timbrado: '87654321',
    timbradoValidFrom: '2026-01-01T00:00:00.000Z',
    timbradoValidUntil: '2027-12-31T00:00:00.000Z',
    sequential: 7,
    seriesId: 'series-nc',
    pdfFileId: null,
    formPrintCount: 0,
    formPrintedAt: null,
    physicalScan: null,
    items: [
      {
        id: 'cni-1',
        invoiceItemId: 'ii-1',
        description: 'Heladera',
        quantity: 1,
        unitPrice: '1100000',
        total: '1100000',
        ivaRate: '10',
        ivaAmount: '100000',
        restockQuantity: 1,
        serialNumbers: ['SN-2'],
      },
    ],
    refunds: [],
    customerCredits: [{ id: 'cc-1', amount: '100000', createdAt: '2026-10-28T13:00:00.000Z' }],
    events: [
      {
        id: 'e-1',
        type: 'CREDIT_NOTE_ISSUED',
        detail: { number: '001-001-0000007', total: 1100000 },
        userId: 'me',
        createdAt: '2026-10-28T13:00:00.000Z',
        creditNoteId: 'cn-1',
      },
    ],
  } as unknown as CreditNoteDetail;

  it('shows the note, what it settled and the invoice it modifies', () => {
    state.data = note;
    const html = render(CreditNoteDetailPage, {});
    expect(html).toContain('001-001-0000007');
    expect(html).toContain('Devolución de ítems');
    expect(html).toContain('Gs. 1.000.000');
    expect(html).toContain('Saldo a favor');
    expect(html).toContain('001-002-0000009');
    expect(html).toContain('SN-2');
    expect(html).toContain('Nota de crédito emitida');
  });

  it('prints a talonario note on the sheet instead of a PDF', () => {
    state.data = note;
    const html = render(CreditNoteDetailPage, {});
    expect(html).toContain('Imprimir sobre la hoja');
    expect(html).toContain('Sin imprimir');
    expect(html).not.toContain('Generar PDF');
  });

  it('offers to generate the PDF of a self-printed note', () => {
    state.data = { ...note, modality: 'SELF_PRINTED' };
    const html = render(CreditNoteDetailPage, {});
    expect(html).toContain('Generar PDF');
    expect(html).not.toContain('Hoja del talonario');
  });
});

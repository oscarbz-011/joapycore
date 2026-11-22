import { describe, expect, it } from 'vitest';
import type { Installment, Loan } from './api/finance';
import {
  customerSummary,
  loanInvoiceRef,
  loanTitle,
  selectAllAcross,
  selectByAmountAcross,
  selectedByLoan,
  selectOverdueAcross,
} from './customer-collect';

// Mediodía en Paraguay del 20/11/2026.
const NOW = new Date('2026-11-20T15:00:00.000Z');

const inst = (
  loanId: string,
  number: number,
  dueDate: string,
  overrides: Partial<Installment> = {},
): Installment => ({
  id: `${loanId}-${number}`,
  loanId,
  number,
  dueDate: `${dueDate}T00:00:00.000Z`,
  amount: 100_000,
  paidAmount: 0,
  paidAt: null,
  paymentDate: null,
  status: 'PENDING',
  notes: null,
  ...overrides,
});

const loan = (id: string, installments: Installment[], product = 'Ventilador'): Loan => ({
  id,
  tenantId: 't',
  saleOrderId: `order-${id}`,
  customerId: 'c',
  principal: 0,
  interestRate: 0,
  totalAmount: 0,
  totalInstallments: installments.length,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  customer: { id: 'c', firstName: 'Alberto', lastName: 'Benítez' },
  saleOrder: {
    id: `order-${id}`,
    orderDate: '2026-09-01T00:00:00.000Z',
    items: [{ id: 'i', quantity: 1, description: null, product: { id: 'p', name: product, model: null } }],
    invoice: { id: 'inv', invoicePrefix: '001-001-', invoiceNumber: '0000018', issuedAt: null },
  },
  installments,
});

// Escenario 1: 4 productos, 7 cuotas, Gs. 700.000; el cliente entrega 300.000.
const fourProducts = [
  loan('a', [inst('a', 1, '2026-08-05'), inst('a', 2, '2026-09-05')]),
  loan('b', [inst('b', 1, '2026-10-05'), inst('b', 2, '2026-11-05')]),
  loan('c', [inst('c', 1, '2026-09-05')]),
  loan('d', [inst('d', 1, '2026-12-05'), inst('d', 2, '2027-01-05')]),
];

describe('selectByAmountAcross', () => {
  it('pays the installments that fell due first, whatever product they are from', () => {
    const { selection, leftover, lastIsPartial } = selectByAmountAcross(fourProducts, 300_000);

    expect(selection).toEqual({ 'a-1': 100_000, 'a-2': 100_000, 'c-1': 100_000 });
    expect(leftover).toBe(0);
    expect(lastIsPartial).toBe(false);
  });

  it('leaves the last installment partial and breaks ties by the older sale', () => {
    const sameDay = [
      loan('old', [inst('old', 1, '2026-10-05')]),
      loan('new', [inst('new', 1, '2026-10-05')]),
    ];

    const result = selectByAmountAcross(sameDay, 150_000);

    expect(result.selection).toEqual({ 'old-1': 100_000, 'new-1': 50_000 });
    expect(result.lastIsPartial).toBe(true);
  });

  it('counts open charges and skips what is already paid', () => {
    const loans = [
      loan('a', [
        inst('a', 1, '2026-08-05', { status: 'PAID', paidAmount: 100_000 }),
        inst('a', 2, '2026-09-05', {
          paidAmount: 40_000,
          status: 'PARTIAL',
          interestCharges: [{ id: 'x', amount: '5000', component: { name: 'Mora' } }],
        }),
      ]),
    ];

    expect(selectByAmountAcross(loans, 100_000)).toEqual({
      selection: { 'a-2': 65_000 },
      leftover: 35_000,
      lastIsPartial: false,
    });
  });
});

describe('selecting across products', () => {
  it('selects every overdue installment of every product (scenario 2 starting point)', () => {
    expect(Object.keys(selectOverdueAcross(fourProducts, NOW)).sort()).toEqual([
      'a-1',
      'a-2',
      'b-1',
      'b-2',
      'c-1',
    ]);
  });

  it('selects everything payable', () => {
    expect(Object.keys(selectAllAcross(fourProducts))).toHaveLength(7);
  });

  it('groups the selection by product, oldest sale first', () => {
    const groups = selectedByLoan(fourProducts, { 'c-1': 100_000, 'a-2': 30_000 });

    expect(groups.map((g) => g.map((s) => [s.inst.id, s.amount, s.isFull]))).toEqual([
      [['a-2', 30_000, false]],
      [['c-1', 100_000, true]],
    ]);
  });
});

describe('customerSummary', () => {
  it('adds up every product and points to the earliest unpaid installment', () => {
    const summary = customerSummary(fourProducts, NOW);

    expect(summary.owedToday).toBe(700_000);
    expect(summary.overdueCount).toBe(5);
    expect(summary.overdue).toBe(500_000);
    expect(summary.nextDue?.id).toBe('a-1');
  });
});

describe('loan labels', () => {
  it('names the product and the invoice', () => {
    expect(loanTitle(fourProducts[0])).toBe('Ventilador');
    expect(loanInvoiceRef(fourProducts[0])).toBe('001-001-0000018');
  });

  it('mentions how many more products the sale has', () => {
    const sale = loan('x', []);
    sale.saleOrder.items.push({ id: 'j', quantity: 1, description: 'Instalación', product: null });
    expect(loanTitle(sale)).toBe('Ventilador y 1 más');
  });
});

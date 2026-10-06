import { describe, expect, it } from 'vitest';
import {
  differenceLabel,
  invoiceFormError,
  invoicePreview,
  lineDifferenceLabel,
  payBeforeInvoiceWarning,
  payableInvoiceState,
  type InvoiceLine,
} from './supplier-invoice';

// Recibido: 10 × 100.000 y 5 × 40.000 = 1.200.000
const line = (overrides: Partial<InvoiceLine> = {}): InvoiceLine => ({
  receiptItemId: 'ri-1',
  productName: 'Licuadora',
  receivedQuantity: 10,
  receivedUnitCost: 100_000,
  quantity: 10,
  unitCost: 100_000,
  ...overrides,
});
const second = line({
  receiptItemId: 'ri-2',
  productName: 'Tostadora',
  receivedQuantity: 5,
  receivedUnitCost: 40_000,
  quantity: 5,
  unitCost: 40_000,
});

describe('invoicePreview', () => {
  it('matches when the invoice says what was received', () => {
    expect(invoicePreview([line(), second], 0, 0)).toEqual({
      subtotal: 1_200_000,
      total: 1_200_000,
      estimated: 1_200_000,
      difference: 0,
      lineDifferences: [],
      needsApproval: false,
    });
  });

  it('points at the line whose quantity or price differs', () => {
    const preview = invoicePreview(
      [line({ quantity: 8 }), { ...second, unitCost: 45_000 }],
      0,
      0,
    );

    expect(preview.lineDifferences).toEqual([
      {
        receiptItemId: 'ri-1',
        productName: 'Licuadora',
        kind: 'quantity',
        received: 10,
        invoiced: 8,
      },
      {
        receiptItemId: 'ri-2',
        productName: 'Tostadora',
        kind: 'price',
        received: 40_000,
        invoiced: 45_000,
      },
    ]);
    expect(preview.difference).toBe(-175_000);
    expect(preview.needsApproval).toBe(true);
  });

  // El envío y el descuento no estaban en la estimación.
  it('asks for approval for shipping or a discount, even if they cancel out', () => {
    const preview = invoicePreview([line()], 50_000, 50_000);

    expect(preview.difference).toBe(0);
    expect(preview.needsApproval).toBe(true);
    expect(invoicePreview([line()], 50_000, 0).total).toBe(1_050_000);
  });
});

describe('labels', () => {
  it('says what differs in plain words', () => {
    expect(
      lineDifferenceLabel({
        receiptItemId: 'ri-1',
        productName: 'Licuadora',
        kind: 'quantity',
        received: 10,
        invoiced: 8,
      }),
    ).toBe('Facturó 8, se recibieron 10');
    expect(
      lineDifferenceLabel({
        receiptItemId: 'ri-2',
        productName: 'Tostadora',
        kind: 'price',
        received: 40_000,
        invoiced: 45_000,
      }),
    ).toBe('Facturó a Gs. 45.000, la orden decía Gs. 40.000');
  });

  it('says which way the total moved', () => {
    expect(differenceLabel(0)).toBe('Igual a lo estimado');
    expect(differenceLabel(25_000)).toBe('Gs. 25.000 más que lo estimado');
    expect(differenceLabel(-175_000)).toBe('Gs. 175.000 menos que lo estimado');
  });
});

describe('invoiceFormError', () => {
  const header = {
    invoiceNumber: '001-001-0000123',
    invoiceDate: '2026-10-07',
    shipping: 0,
    discount: 0,
  };

  it('accepts a complete invoice', () => {
    expect(invoiceFormError(header, [line()])).toBeNull();
  });

  it('asks for a receipt, the number and the date', () => {
    expect(invoiceFormError(header, [])).toMatch(/recepción/);
    expect(invoiceFormError({ ...header, invoiceNumber: '  ' }, [line()])).toMatch(
      /número/,
    );
    expect(invoiceFormError({ ...header, invoiceDate: '' }, [line()])).toMatch(
      /fecha/,
    );
  });

  // Cantidad 0 es válida: el proveedor no facturó esa línea.
  it('accepts a line invoiced at zero but not a fraction or a negative', () => {
    expect(invoiceFormError(header, [line({ quantity: 0 })])).toBeNull();
    expect(invoiceFormError(header, [line({ quantity: 2.5 })])).toMatch(
      /Licuadora/,
    );
    expect(invoiceFormError(header, [line({ unitCost: -1 })])).toMatch(
      /Licuadora/,
    );
  });

  it('rejects a discount larger than what was invoiced', () => {
    expect(
      invoiceFormError({ ...header, discount: 1_000_001 }, [line()]),
    ).toMatch(/descuento/);
  });
});

describe('payable and its invoice', () => {
  it('is an estimate until an invoice is in force', () => {
    expect(payableInvoiceState({})).toBe('estimated');
    expect(payableInvoiceState({ supplierInvoice: null })).toBe('estimated');
    expect(
      payableInvoiceState({ supplierInvoice: { status: 'REJECTED' } }),
    ).toBe('estimated');
    expect(
      payableInvoiceState({ supplierInvoice: { status: 'PENDING_APPROVAL' } }),
    ).toBe('pending');
    expect(payableInvoiceState({ supplierInvoice: { status: 'MATCHED' } })).toBe(
      'invoiced',
    );
    expect(payableInvoiceState({ supplierInvoice: { status: 'APPROVED' } })).toBe(
      'invoiced',
    );
  });

  // Pagar sin factura se permite, con aviso.
  it('warns, without blocking, when paying before the invoice is settled', () => {
    expect(payBeforeInvoiceWarning('estimated')).toMatch(/estimación.*igual/);
    expect(payBeforeInvoiceWarning('pending')).toMatch(/aprobación.*igual/);
    expect(payBeforeInvoiceWarning('invoiced')).toBeNull();
  });
});

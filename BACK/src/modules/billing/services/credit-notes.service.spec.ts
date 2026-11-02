import { CreditNotesService } from './credit-notes.service';

const NUMBERING = {
  seriesId: 'series-nc',
  modality: 'SELF_PRINTED' as const,
  timbrado: '12345678',
  timbradoValidFrom: new Date('2026-01-01T00:00:00.000Z'),
  timbradoValidUntil: new Date('2026-12-31T00:00:00.000Z'),
  serieCode: '',
  establecimiento: '001',
  puntoExpedicion: '001',
  sequential: 7,
  invoiceNumber: '0000007',
  invoicePrefix: '001-001-',
};

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    status: 'ISSUED',
    invoiceType: 'SALE',
    total: 2_231_500,
    creditedTotal: 0,
    anonymousBuyer: false,
    invoicePrefix: '001-001-',
    invoiceNumber: '0000009',
    issuedAt: new Date('2026-10-28T13:00:00.000Z'),
    updatedAt: new Date('2026-10-28T13:00:00.000Z'),
    saleOrderId: 'order-1',
    series: { branchId: 'branch-1' },
    saleOrder: {
      saleType: 'CASH',
      customerId: 'cust-1',
      branchId: 'branch-1',
      downPayment: null,
      customer: { id: 'cust-1', firstName: 'Maria', lastName: 'Perez' },
    },
    paymentReceipt: null,
    items: [
      {
        id: 'ii-1',
        description: 'Heladera',
        quantity: 2,
        unitPrice: 1_100_000,
        total: 2_200_000,
        ivaRate: 10,
        saleOrderItemId: 'soi-1',
      },
      {
        id: 'ii-2',
        description: 'Arroz',
        quantity: 3,
        unitPrice: 10_500,
        total: 31_500,
        ivaRate: 5,
        saleOrderItemId: 'soi-2',
      },
    ],
    ...overrides,
  };
}

describe('CreditNotesService', () => {
  const tx = { marker: 'tx' };
  let service: CreditNotesService;
  let invoices: Record<string, jest.Mock>;
  let creditNotes: Record<string, jest.Mock>;
  let settlements: Record<string, jest.Mock>;
  let events: Record<string, jest.Mock>;
  let series: Record<string, jest.Mock>;
  let outbox: Record<string, jest.Mock>;
  let eventBus: Record<string, jest.Mock>;
  let receivables: Record<string, jest.Mock>;
  let loanCredits: Record<string, jest.Mock>;
  let stockLedger: Record<string, jest.Mock>;

  beforeEach(() => {
    invoices = {
      findForCredit: jest.fn().mockResolvedValue(makeInvoice()),
      addCredited: jest.fn().mockResolvedValue({ count: 1 }),
      voidIfAllowed: jest.fn().mockResolvedValue({ count: 1 }),
    };
    creditNotes = {
      creditedQuantities: jest.fn().mockResolvedValue(new Map()),
      createWithItems: jest.fn().mockResolvedValue({ id: 'cn-1' }),
      findById: jest.fn().mockResolvedValue({ id: 'cn-1', formPrintCount: 1 }),
      findForReceipt: jest.fn(),
      recordFormPrint: jest.fn(),
    };
    settlements = {
      addCustomerCredit: jest.fn(),
      createRefund: jest.fn(),
      customerBalance: jest.fn().mockResolvedValue(0),
    };
    events = {
      record: jest.fn(),
      findByCreditNote: jest.fn().mockResolvedValue([]),
    };
    series = {
      numberForIssue: jest.fn().mockResolvedValue(NUMBERING),
      formFitProblem: jest.fn().mockResolvedValue(null),
      findIssueOptions: jest.fn().mockResolvedValue([]),
    };
    outbox = {
      enqueue: jest.fn().mockResolvedValue('event-1'),
      dispatch: jest.fn().mockResolvedValue(true),
    };
    eventBus = { emit: jest.fn() };
    receivables = {
      balance: jest.fn().mockResolvedValue({
        amount: 2_231_500,
        paid: 0,
        outstanding: 2_231_500,
      }),
      applyCredit: jest.fn(),
    };
    loanCredits = {
      applyCredit: jest.fn().mockResolvedValue(0),
      cancel: jest.fn(),
      hasCollected: jest.fn().mockResolvedValue(false),
    };
    stockLedger = {
      findReturnable: jest.fn().mockResolvedValue(new Map()),
      restockReturn: jest.fn(),
    };
    service = new CreditNotesService(
      { $transaction: jest.fn((cb) => cb(tx)) } as any,
      invoices as any,
      creditNotes as any,
      settlements as any,
      events as any,
      series as any,
      { generate: jest.fn() } as any,
      { getById: jest.fn() } as any,
      outbox as any,
      eventBus as any,
      receivables as any,
      loanCredits as any,
      stockLedger as any,
    );
  });

  describe('issue', () => {
    it('numbers the note with a credit note series and discounts what is owed', async () => {
      await service.issue(
        'tenant-1',
        'inv-1',
        {
          kind: 'ITEMS',
          reason: 'Devolvió una heladera',
          items: [{ invoiceItemId: 'ii-1', quantity: 1 }],
        },
        'user-1',
      );

      expect(series.numberForIssue).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          branchId: 'branch-1',
          documentType: 'CREDIT_NOTE',
        }),
        tx,
      );
      expect(invoices.addCredited).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        0,
        1_100_000,
        tx,
      );
      expect(creditNotes.createWithItems).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 1_100_000,
          number: '0000007',
          numberPrefix: '001-001-',
          customerId: 'cust-1',
          appliedToBalance: 1_100_000,
        }),
        [expect.objectContaining({ invoiceItemId: 'ii-1', quantity: 1 })],
        tx,
      );
      expect(receivables.applyCredit).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'inv-1',
        1_100_000,
      );
      expect(loanCredits.applyCredit).not.toHaveBeenCalled();
      expect(settlements.addCustomerCredit).not.toHaveBeenCalled();
      expect(settlements.createRefund).not.toHaveBeenCalled();
    });

    it('generates the PDF of a self-printed note through the outbox after the commit', async () => {
      await service.issue('tenant-1', 'inv-1', {
        kind: 'AMOUNT',
        reason: 'Pago anticipado',
        amount: 110_000,
        ivaRate: 10,
      });

      expect(outbox.enqueue).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'credit-note.pdf.requested',
        expect.objectContaining({ creditNoteId: 'cn-1' }),
      );
      expect(outbox.dispatch).toHaveBeenCalledWith('event-1');
    });

    it('has no PDF on a talonario and checks that the lines fit the sheet', async () => {
      series.numberForIssue.mockResolvedValue({
        ...NUMBERING,
        modality: 'PREPRINTED',
      });

      await service.issue('tenant-1', 'inv-1', {
        kind: 'TOTAL',
        reason: 'Se anula la venta',
        documentNumber: 7,
      });

      expect(series.formFitProblem).toHaveBeenCalledWith(
        'tenant-1',
        'series-nc',
        2,
        tx,
        'creditNote',
      );
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('shrinks the installments of a credit sale', async () => {
      invoices.findForCredit.mockResolvedValue(
        makeInvoice({
          saleOrder: { ...makeInvoice().saleOrder, saleType: 'CREDIT' },
        }),
      );

      await service.issue('tenant-1', 'inv-1', {
        kind: 'AMOUNT',
        reason: 'Bonificación',
        amount: 200_000,
        ivaRate: 10,
      });

      expect(loanCredits.applyCredit).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'order-1',
        200_000,
      );
    });

    it('asks what to do with the money a customer already paid', async () => {
      invoices.findForCredit.mockResolvedValue(makeInvoice({ status: 'PAID' }));

      await expect(
        service.issue('tenant-1', 'inv-1', {
          kind: 'AMOUNT',
          reason: 'Bonificación',
          amount: 100_000,
          ivaRate: 10,
        }),
      ).rejects.toThrow('elegí si queda como saldo a favor o se le devuelve');
      expect(creditNotes.createWithItems).not.toHaveBeenCalled();
    });

    it('leaves the excess as customer credit', async () => {
      receivables.balance.mockResolvedValue({
        amount: 2_231_500,
        paid: 2_200_000,
        outstanding: 31_500,
      });

      await service.issue('tenant-1', 'inv-1', {
        kind: 'ITEMS',
        reason: 'Devolución',
        items: [{ invoiceItemId: 'ii-1', quantity: 1 }],
        excess: { mode: 'CUSTOMER_CREDIT' },
      });

      expect(receivables.applyCredit).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'inv-1',
        31_500,
      );
      expect(settlements.addCustomerCredit).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-1',
          amount: 1_068_500,
          source: 'CREDIT_NOTE',
          creditNoteId: 'cn-1',
        }),
        tx,
      );
    });

    it('records the refund with how it was paid back', async () => {
      invoices.findForCredit.mockResolvedValue(makeInvoice({ status: 'PAID' }));

      await service.issue('tenant-1', 'inv-1', {
        kind: 'AMOUNT',
        reason: 'Bonificación',
        amount: 100_000,
        ivaRate: 10,
        excess: { mode: 'REFUND', method: 'CASH', reference: 'Caja 1' },
      });

      expect(settlements.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100_000,
          method: 'CASH',
          reference: 'Caja 1',
        }),
        tx,
      );
    });

    it('only refunds an anonymous buyer', async () => {
      invoices.findForCredit.mockResolvedValue(
        makeInvoice({ status: 'PAID', anonymousBuyer: true }),
      );

      await expect(
        service.issue('tenant-1', 'inv-1', {
          kind: 'AMOUNT',
          reason: 'Bonificación',
          amount: 100_000,
          excess: { mode: 'CUSTOMER_CREDIT' },
        }),
      ).rejects.toThrow('el excedente solo se puede devolver');
    });

    it('returns the chosen units to stock', async () => {
      await service.issue('tenant-1', 'inv-1', {
        kind: 'ITEMS',
        reason: 'Devolución',
        items: [{ invoiceItemId: 'ii-1', quantity: 2 }],
        restock: [
          { invoiceItemId: 'ii-1', quantity: 1, serialNumbers: ['SN-1'] },
        ],
      });

      expect(stockLedger.restockReturn).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'cn-1',
        [{ saleItemId: 'soi-1', quantity: 1, serialNumbers: ['SN-1'] }],
      );
      expect(creditNotes.createWithItems).toHaveBeenCalledWith(
        expect.anything(),
        [
          expect.objectContaining({
            restockQuantity: 1,
            serialNumbers: ['SN-1'],
          }),
        ],
        tx,
      );
    });

    it.each([
      [
        {
          kind: 'AMOUNT',
          amount: 1000,
          restock: [{ invoiceItemId: 'ii-1', quantity: 1 }],
        },
        'no devuelve mercadería',
      ],
      [
        {
          kind: 'ITEMS',
          items: [{ invoiceItemId: 'ii-1', quantity: 1 }],
          restock: [{ invoiceItemId: 'ii-2', quantity: 1 }],
        },
        'Solo vuelve al stock lo que se acredita',
      ],
      [
        {
          kind: 'ITEMS',
          items: [{ invoiceItemId: 'ii-1', quantity: 1 }],
          restock: [{ invoiceItemId: 'ii-1', quantity: 2 }],
        },
        'vuelven al stock hasta 1 unidades',
      ],
    ])('rejects restocking %j', async (request, message) => {
      await expect(
        service.issue('tenant-1', 'inv-1', {
          reason: 'Devolución',
          ...(request as object),
        } as never),
      ).rejects.toThrow(message);
    });

    it('rejects an item that is not linked to the sale order', async () => {
      invoices.findForCredit.mockResolvedValue(
        makeInvoice({
          items: [{ ...makeInvoice().items[0], saleOrderItemId: null }],
          total: 2_200_000,
        }),
      );

      await expect(
        service.issue('tenant-1', 'inv-1', {
          kind: 'ITEMS',
          reason: 'Devolución',
          items: [{ invoiceItemId: 'ii-1', quantity: 1 }],
          restock: [{ invoiceItemId: 'ii-1', quantity: 1 }],
        }),
      ).rejects.toThrow('no está vinculado al pedido de venta');
    });

    it('fails when someone else credited the invoice at the same time', async () => {
      invoices.addCredited.mockResolvedValue({ count: 0 });

      await expect(
        service.issue('tenant-1', 'inv-1', {
          kind: 'AMOUNT',
          reason: 'Bonificación',
          amount: 100_000,
        }),
      ).rejects.toThrow('La factura cambió');
      expect(creditNotes.createWithItems).not.toHaveBeenCalled();
    });

    it.each([
      ['PENDING', 'un borrador no se acredita'],
      ['CANCELLED', 'está anulada'],
    ])('does not credit a %s invoice', async (status, message) => {
      invoices.findForCredit.mockResolvedValue(makeInvoice({ status }));

      await expect(
        service.issue('tenant-1', 'inv-1', {
          kind: 'TOTAL',
          reason: 'Se anula',
        }),
      ).rejects.toThrow(message);
    });

    it('does not find an invoice of another tenant', async () => {
      invoices.findForCredit.mockResolvedValue(null);

      await expect(
        service.issue('tenant-2', 'inv-1', { kind: 'TOTAL', reason: 'x' }),
      ).rejects.toThrow('Factura no encontrada');
      expect(invoices.findForCredit).toHaveBeenCalledWith(
        'tenant-2',
        'inv-1',
        tx,
      );
    });
  });

  describe('voidInvoice', () => {
    it('voids an issued invoice that was not collected and lets stock and receivables react', async () => {
      await service.voidInvoice(
        'tenant-1',
        'inv-1',
        { reason: 'Se cargó al cliente equivocado' },
        'user-1',
      );

      expect(invoices.voidIfAllowed).toHaveBeenCalledWith(
        'tenant-1',
        'inv-1',
        'ISSUED',
        expect.any(Date),
        'Se cargó al cliente equivocado',
        expect.any(Date),
        tx,
      );
      expect(events.record).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'VOIDED', invoiceId: 'inv-1' }),
        tx,
      );
      expect(eventBus.emit).toHaveBeenCalledWith('invoice.cancelled', {
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
      });
    });

    it('cancels the financing of a credit sale', async () => {
      invoices.findForCredit.mockResolvedValue(
        makeInvoice({
          saleOrder: { ...makeInvoice().saleOrder, saleType: 'CREDIT' },
        }),
      );

      await service.voidInvoice('tenant-1', 'inv-1', {
        reason: 'Error de carga',
      });

      expect(loanCredits.cancel).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'order-1',
      );
    });

    it.each([
      ['a payment on the receivable', { arPaid: 100_000 }],
      ['a collected installment', { collected: true, credit: true }],
      ['a down payment', { downPayment: 500_000 }],
    ])('rejects voiding an invoice with %s', async (_label, setup) => {
      const options = setup as {
        arPaid?: number;
        collected?: boolean;
        credit?: boolean;
        downPayment?: number;
      };
      receivables.balance.mockResolvedValue({
        amount: 2_231_500,
        paid: options.arPaid ?? 0,
        outstanding: 2_231_500 - (options.arPaid ?? 0),
      });
      loanCredits.hasCollected.mockResolvedValue(Boolean(options.collected));
      invoices.findForCredit.mockResolvedValue(
        makeInvoice({
          saleOrder: {
            ...makeInvoice().saleOrder,
            saleType: options.credit ? 'CREDIT' : 'CASH',
            downPayment: options.downPayment
              ? { amount: options.downPayment }
              : null,
          },
        }),
      );

      await expect(
        service.voidInvoice('tenant-1', 'inv-1', { reason: 'Error de carga' }),
      ).rejects.toThrow('ya tiene cobros');
      expect(invoices.voidIfAllowed).not.toHaveBeenCalled();
    });

    it('settles the money of a paid cash-register sale', async () => {
      invoices.findForCredit.mockResolvedValue(makeInvoice({ status: 'PAID' }));

      await service.voidInvoice('tenant-1', 'inv-1', {
        reason: 'El cliente se arrepintió',
        settlement: { mode: 'REFUND', method: 'CASH' },
      });

      expect(settlements.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2_231_500,
          method: 'CASH',
          creditNoteId: null,
        }),
        tx,
      );
    });

    it('requires a settlement to void a paid invoice', async () => {
      invoices.findForCredit.mockResolvedValue(makeInvoice({ status: 'PAID' }));

      await expect(
        service.voidInvoice('tenant-1', 'inv-1', {
          reason: 'El cliente se arrepintió',
        }),
      ).rejects.toThrow('saldo a favor o se le devuelve');
    });

    it.each([
      [{ creditedTotal: 100_000 }, 'ya tiene notas de crédito'],
      [{ invoiceType: 'INTEREST', status: 'PAID' }, 'factura de intereses'],
      [{ status: 'PENDING' }, 'se descarta'],
      [{ status: 'CANCELLED' }, 'ya está anulada'],
    ])('rejects voiding %j', async (overrides, message) => {
      invoices.findForCredit.mockResolvedValue(makeInvoice(overrides));

      await expect(
        service.voidInvoice('tenant-1', 'inv-1', { reason: 'Error de carga' }),
      ).rejects.toThrow(message);
    });

    it('fails when the invoice changed before voiding', async () => {
      invoices.voidIfAllowed.mockResolvedValue({ count: 0 });

      await expect(
        service.voidInvoice('tenant-1', 'inv-1', { reason: 'Error de carga' }),
      ).rejects.toThrow('La factura cambió');
      expect(eventBus.emit).not.toHaveBeenCalledWith(
        'invoice.cancelled',
        expect.anything(),
      );
    });
  });

  describe('print', () => {
    it('only prints a talonario note on the sheet', async () => {
      creditNotes.findForReceipt.mockResolvedValue({
        modality: 'SELF_PRINTED',
      });

      await expect(service.print('tenant-1', 'cn-1')).rejects.toThrow(
        'Solo una nota de crédito de talonario',
      );
      expect(creditNotes.recordFormPrint).not.toHaveBeenCalled();
    });
  });
});

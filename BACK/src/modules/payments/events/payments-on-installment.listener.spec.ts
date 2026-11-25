import { Prisma } from '@prisma/client';
import { EventBus } from '../../../common/events/event-bus';
import { PaymentsOnInstallmentListener } from './payments-on-installment.listener';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';
import { PaymentSourcesRepository } from '../repositories/payment-sources.repository';

const TENANT = 'tenant-1';
const SALE_ORDER_ID = 'order-1';
const INVOICE_ID = 'inv-1';
const AR_ID = 'ar-1';
const LOAN_ID = 'loan-1';
const INST_ID = 'inst-1';

const INSTALLMENT_AMOUNT = 575_000;
const TOTAL_CREDIT = 3_450_000; // 6 cuotas × 575_000

const baseEvent = {
  tenantId: TENANT,
  loanId: LOAN_ID,
  saleOrderId: SALE_ORDER_ID,
  installmentId: INST_ID,
  amount: INSTALLMENT_AMOUNT,
};

function makeAR(overrides: Record<string, unknown> = {}) {
  return {
    id: AR_ID,
    tenantId: TENANT,
    invoiceId: INVOICE_ID,
    amount: TOTAL_CREDIT,
    paidAmount: 0,
    status: 'PENDING' as const,
    ...overrides,
  };
}

describe('PaymentsOnInstallmentListener', () => {
  let listener: PaymentsOnInstallmentListener;
  let prisma: {
    invoice: { findFirst: jest.Mock };
    accountsReceivable: { findFirst: jest.Mock };
  };
  let arRepository: {
    findByInvoice: jest.Mock;
    incrementPaid: jest.Mock;
    updateStatus: jest.Mock;
    findAmounts: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue({ id: INVOICE_ID }) },
      accountsReceivable: {
        findFirst: jest.fn().mockResolvedValue({
          id: AR_ID,
          amount: INSTALLMENT_AMOUNT, // one cuota paid out of six
          paidAmount: INSTALLMENT_AMOUNT,
        }),
      },
    };
    arRepository = {
      findByInvoice: jest.fn().mockResolvedValue(makeAR()),
      incrementPaid: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      // Implementación real sobre el mock de Prisma.
      findAmounts: jest.fn((tenantId: string, id: string) =>
        new AccountsReceivableRepository(prisma as any).findAmounts(
          tenantId,
          id,
        ),
      ),
    };
    eventEmitter = { emit: jest.fn() };

    listener = new PaymentsOnInstallmentListener(
      new PaymentSourcesRepository(prisma as any),
      arRepository as any,
      eventEmitter as unknown as EventBus,
    );
  });

  describe('handle (installment.paid)', () => {
    it('increments AR paidAmount by the installment payment amount', async () => {
      await listener.handle(baseEvent);

      expect(arRepository.incrementPaid).toHaveBeenCalledWith(
        AR_ID,
        INSTALLMENT_AMOUNT,
      );
    });

    it('marks AR as PARTIAL when payment does not cover the full financed total', async () => {
      // After paying 575_000 of 3_450_000 the balance is not exhausted
      prisma.accountsReceivable.findFirst.mockResolvedValue({
        id: AR_ID,
        amount: TOTAL_CREDIT,
        paidAmount: INSTALLMENT_AMOUNT,
      });

      await listener.handle(baseEvent);

      expect(arRepository.updateStatus).toHaveBeenCalledWith(AR_ID, 'PARTIAL');
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'payment.ar.completed',
        expect.anything(),
      );
    });

    it('marks AR as PAID and emits payment.ar.completed when last installment is paid', async () => {
      // All six installments paid → paidAmount equals the full credit total
      prisma.accountsReceivable.findFirst.mockResolvedValue({
        id: AR_ID,
        amount: TOTAL_CREDIT,
        paidAmount: TOTAL_CREDIT,
      });

      await listener.handle(baseEvent);

      expect(arRepository.updateStatus).toHaveBeenCalledWith(AR_ID, 'PAID');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.ar.completed',
        expect.objectContaining({ tenantId: TENANT, arId: AR_ID }),
      );
    });

    // En guaraníes no hay montos menores a 1 Gs: falta 1 Gs y queda abierta.
    it('keeps the AR open while a whole guaraní is still owed', async () => {
      prisma.accountsReceivable.findFirst.mockResolvedValue({
        id: AR_ID,
        amount: new Prisma.Decimal(TOTAL_CREDIT),
        paidAmount: new Prisma.Decimal(TOTAL_CREDIT).minus(1),
      });

      await listener.handle(baseEvent);

      expect(arRepository.updateStatus).toHaveBeenCalledWith(AR_ID, 'PARTIAL');
    });

    // Un crédito viejo con cuotas de 33.333,33 deja 0,01 que no se puede
    // cobrar: la cuenta se cierra igual que el préstamo.
    it('closes the AR when only the cents of an old credit remain', async () => {
      prisma.accountsReceivable.findFirst.mockResolvedValue({
        id: AR_ID,
        amount: new Prisma.Decimal(100000),
        paidAmount: new Prisma.Decimal('99999.99'),
      });

      await listener.handle(baseEvent);

      expect(arRepository.updateStatus).toHaveBeenCalledWith(AR_ID, 'PAID');
    });

    it('compares the Prisma Decimal values exactly', async () => {
      prisma.accountsReceivable.findFirst.mockResolvedValue({
        id: AR_ID,
        amount: new Prisma.Decimal(TOTAL_CREDIT),
        paidAmount: new Prisma.Decimal(TOTAL_CREDIT),
      });

      await listener.handle(baseEvent);

      expect(arRepository.updateStatus).toHaveBeenCalledWith(AR_ID, 'PAID');
    });

    it('returns early without touching the AR when the invoice is not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await listener.handle(baseEvent);

      expect(arRepository.findByInvoice).not.toHaveBeenCalled();
      expect(arRepository.incrementPaid).not.toHaveBeenCalled();
    });

    it('returns early when no AR exists for the invoice yet', async () => {
      arRepository.findByInvoice.mockResolvedValue(null);

      await listener.handle(baseEvent);

      expect(arRepository.incrementPaid).not.toHaveBeenCalled();
    });

    it('returns early when AR is already PAID (idempotency guard)', async () => {
      arRepository.findByInvoice.mockResolvedValue(makeAR({ status: 'PAID' }));

      await listener.handle(baseEvent);

      expect(arRepository.incrementPaid).not.toHaveBeenCalled();
    });

    it('returns early when AR is CANCELLED', async () => {
      arRepository.findByInvoice.mockResolvedValue(
        makeAR({ status: 'CANCELLED' }),
      );

      await listener.handle(baseEvent);

      expect(arRepository.incrementPaid).not.toHaveBeenCalled();
    });

    it('does not propagate errors (handler is wrapped in try/catch)', async () => {
      prisma.invoice.findFirst.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(listener.handle(baseEvent)).resolves.toBeUndefined();
    });
  });
});

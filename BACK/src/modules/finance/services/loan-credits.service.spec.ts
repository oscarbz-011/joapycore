import { LoanCreditsService } from './loan-credits.service';

describe('LoanCreditsService', () => {
  const tx = { marker: 'tx' } as never;
  let loans: { findBareBySaleOrder: jest.Mock; update: jest.Mock };
  let installments: {
    findOpenByLoanFromLast: jest.Mock;
    update: jest.Mock;
    hasCollected: jest.Mock;
  };
  let service: LoanCreditsService;

  // Cuotas de la última a la primera.
  const open = [
    { id: 'i-3', amount: 300, paidAmount: 0, status: 'PENDING', paidAt: null },
    {
      id: 'i-2',
      amount: 300,
      paidAmount: 100,
      status: 'PARTIAL',
      paidAt: null,
    },
    { id: 'i-1', amount: 300, paidAmount: 0, status: 'OVERDUE', paidAt: null },
  ];

  beforeEach(() => {
    loans = {
      findBareBySaleOrder: jest.fn().mockResolvedValue({
        id: 'loan-1',
        status: 'ACTIVE',
        totalAmount: 900,
      }),
      update: jest.fn(),
    };
    installments = {
      findOpenByLoanFromLast: jest.fn().mockResolvedValue(open),
      update: jest.fn(),
      hasCollected: jest.fn().mockResolvedValue(true),
    };
    service = new LoanCreditsService(loans as never, installments as never);
  });

  it('shrinks the installments from the last one without counting it as collected', async () => {
    const applied = await service.applyCredit(tx, 't-1', 'order-1', 400);

    expect(applied).toBe(400);
    expect(installments.update).toHaveBeenNthCalledWith(
      1,
      'i-3',
      expect.objectContaining({ amount: 0, status: 'PAID' }),
      tx,
    );
    expect(installments.update).toHaveBeenNthCalledWith(
      2,
      'i-2',
      { amount: 200 },
      tx,
    );
    expect(installments.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paidAmount: expect.anything() }),
      tx,
    );
    expect(loans.update).toHaveBeenCalledWith(
      'loan-1',
      { totalAmount: 500 },
      tx,
    );
  });

  it('closes the loan when no installment is left owing', async () => {
    const applied = await service.applyCredit(tx, 't-1', 'order-1', 800);

    expect(applied).toBe(800);
    expect(loans.update).toHaveBeenCalledWith(
      'loan-1',
      { totalAmount: 100, status: 'PAID' },
      tx,
    );
  });

  it('applies nothing without an active loan', async () => {
    loans.findBareBySaleOrder.mockResolvedValue(null);
    await expect(service.applyCredit(tx, 't-1', 'order-1', 100)).resolves.toBe(
      0,
    );
    expect(installments.update).not.toHaveBeenCalled();
  });

  it('cancels the loan of a voided sale', async () => {
    await service.cancel(tx, 't-1', 'order-1');
    expect(loans.update).toHaveBeenLastCalledWith(
      'loan-1',
      { status: 'CANCELLED' },
      tx,
    );
  });

  it('knows whether an installment was collected', async () => {
    await expect(service.hasCollected(tx, 't-1', 'order-1')).resolves.toBe(
      true,
    );
    expect(installments.hasCollected).toHaveBeenCalledWith('t-1', 'loan-1', tx);
  });
});

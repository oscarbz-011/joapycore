import { ReceivablesService } from './receivables.service';

describe('ReceivablesService', () => {
  const tx = { marker: 'tx' } as never;
  let repo: { findOpenByInvoice: jest.Mock; updateAmountAndStatus: jest.Mock };
  let service: ReceivablesService;

  beforeEach(() => {
    repo = {
      findOpenByInvoice: jest.fn(),
      updateAmountAndStatus: jest.fn(),
    };
    service = new ReceivablesService(repo as never);
  });

  it('reports what is still owed', async () => {
    repo.findOpenByInvoice.mockResolvedValue({
      id: 'ar-1',
      amount: 1000,
      paidAmount: 300,
    });
    await expect(service.balance(tx, 't-1', 'inv-1')).resolves.toEqual({
      amount: 1000,
      paid: 300,
      outstanding: 700,
    });
    expect(repo.findOpenByInvoice).toHaveBeenCalledWith('t-1', 'inv-1', tx);
  });

  it('has no balance without an open receivable', async () => {
    repo.findOpenByInvoice.mockResolvedValue(null);
    await expect(service.balance(tx, 't-1', 'inv-1')).resolves.toBeNull();
  });

  it.each([
    [1000, 0, 400, 600, 'PENDING'],
    [1000, 300, 400, 600, 'PARTIAL'],
    [1000, 300, 700, 300, 'PAID'],
  ])(
    'lowers a receivable of %i with %i paid by %i to %i (%s)',
    async (amount, paid, credit, newAmount, status) => {
      repo.findOpenByInvoice.mockResolvedValue({
        id: 'ar-1',
        amount,
        paidAmount: paid,
      });
      await service.applyCredit(tx, 't-1', 'inv-1', credit);
      expect(repo.updateAmountAndStatus).toHaveBeenCalledWith(
        'ar-1',
        newAmount,
        status,
        tx,
      );
    },
  );

  it('never lowers it below what was already paid', async () => {
    repo.findOpenByInvoice.mockResolvedValue({
      id: 'ar-1',
      amount: 1000,
      paidAmount: 800,
    });
    await expect(service.applyCredit(tx, 't-1', 'inv-1', 500)).rejects.toThrow(
      'descuenta más de lo que queda por cobrar',
    );
    expect(repo.updateAmountAndStatus).not.toHaveBeenCalled();
  });

  it('does nothing without a receivable', async () => {
    repo.findOpenByInvoice.mockResolvedValue(null);
    await service.applyCredit(tx, 't-1', 'inv-1', 500);
    expect(repo.updateAmountAndStatus).not.toHaveBeenCalled();
  });
});

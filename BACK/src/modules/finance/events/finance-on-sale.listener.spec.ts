import { Logger } from '@nestjs/common';
import { FinanceOnSaleListener } from './finance-on-sale.listener';
import { LoansService } from '../services/loans.service';

describe('FinanceOnSaleListener', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs and propagates a due-date rescheduling failure', async () => {
    const failure = new Error('database unavailable');
    const loansService = {
      rescheduleInstallments: jest.fn().mockRejectedValue(failure),
    } as unknown as LoansService;
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const listener = new FinanceOnSaleListener(loansService);

    await expect(
      listener.handleDueDateSelected({
        tenantId: 'tenant-1',
        saleOrderId: 'sale-1',
        dueDate: '2026-10-05',
      }),
    ).rejects.toBe(failure);

    expect(loggerError).toHaveBeenCalledWith(
      'No se pudo reprogramar las cuotas del pedido sale-1: database unavailable',
    );
  });
});

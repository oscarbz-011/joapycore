import { apiClient } from './client';

export type LoanStatus = 'ACTIVE' | 'PAID' | 'CANCELLED';
export type InstallmentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface Installment {
  id: string;
  loanId: string;
  number: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  paidAt: string | null;
  status: InstallmentStatus;
  notes: string | null;
}

export interface Loan {
  id: string;
  tenantId: string;
  saleOrderId: string;
  customerId: string;
  principal: number;
  interestRate: number;
  totalAmount: number;
  totalInstallments: number;
  status: LoanStatus;
  contractUrl: string | null;
  createdAt: string;
  customer: { id: string; firstName: string; lastName: string };
  saleOrder: { id: string; orderDate: string };
  installments: Installment[];
}

export interface PayInstallmentPayload {
  amount: number;
  notes?: string;
}

export const financeApi = {
  listLoans: (): Promise<Loan[]> =>
    apiClient.get('/finance/loans').then((r) => r.data),

  getLoan: (id: string): Promise<Loan> =>
    apiClient.get(`/finance/loans/${id}`).then((r) => r.data),

  getLoanByOrder: (saleOrderId: string): Promise<Loan> =>
    apiClient.get(`/finance/loans/by-order/${saleOrderId}`).then((r) => r.data),

  getOverdueInstallments: (): Promise<(Installment & { loan: Pick<Loan, 'id' | 'customer'> })[]> =>
    apiClient.get('/finance/loans/overdue-installments').then((r) => r.data),

  payInstallment: (installmentId: string, dto: PayInstallmentPayload): Promise<Installment> =>
    apiClient
      .post(`/finance/loans/installments/${installmentId}/pay`, dto)
      .then((r) => r.data),
};

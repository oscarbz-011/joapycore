import { defineModule } from '../../common/modules/module-manifest';

export const financeManifest = defineModule({
  key: 'finance',
  kind: 'addon',
  displayName: 'Financiamiento',
  description: 'Créditos, planes de cuotas e installments',
  icon: 'Banknote',
  isStable: true,
  category: 'Finanzas y Contabilidad',
  depends: ['sales', 'billing'],
  owns: [
    'Loan',
    'Installment',
    'InstallmentInterestCharge',
    'PaymentReceipt',
    'PaymentReceiptItem',
  ],
});

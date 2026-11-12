import { defineModule } from '../../common/modules/module-manifest';

export const paymentsManifest = defineModule({
  key: 'payments',
  kind: 'addon',
  displayName: 'Pagos',
  description: 'Cuentas por cobrar y registros de pago',
  icon: 'CreditCard',
  isStable: true,
  category: 'Finanzas y Contabilidad',
  depends: ['billing'],
  owns: ['AccountsReceivable', 'PaymentRecord'],
});

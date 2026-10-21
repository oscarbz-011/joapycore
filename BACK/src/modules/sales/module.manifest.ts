import { defineModule } from '../../common/modules/module-manifest';

export const salesManifest = defineModule({
  key: 'sales',
  kind: 'addon',
  displayName: 'Ventas',
  description: 'Pedidos, presupuestos y gestión de clientes',
  icon: 'ShoppingCart',
  isStable: true,
  depends: ['inventory'],
  owns: [
    'Customer',
    'SaleOrder',
    'SaleOrderItem',
    'SalePayment',
    'DownPayment',
    'Guarantor',
    'SaleCombo',
    'SaleComboItem',
    'SaleTarget',
  ],
});

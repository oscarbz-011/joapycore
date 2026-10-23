import { defineModule } from '../../common/modules/module-manifest';

export const logisticsManifest = defineModule({
  key: 'logistics',
  kind: 'addon',
  displayName: 'Logística',
  description: 'Entrada, salida, almacenamiento y transporte de mercancías',
  icon: 'Route',
  isStable: false,
  depends: ['inventory'],
  owns: [
    'DeliveryNote',
    'DeliveryRoute',
    'DeliveryRouteEvent',
    'DeliveryTrackingEvent',
  ],
});

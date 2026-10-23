import { defineModule } from '../../common/modules/module-manifest';

// Para los rubros que fabrican lo que venden (carpintería, taller): recetas
// de materiales y órdenes de producción que consumen materia prima y dan de
// alta el producto terminado. Ver ProductKind.
export const productionManifest = defineModule({
  key: 'production',
  kind: 'addon',
  displayName: 'Producción',
  description: 'Recetas de materiales y órdenes de producción',
  icon: 'Hammer',
  isStable: false,
  depends: ['inventory'],
  owns: ['ProductComponent', 'ProductionOrder', 'ProductionOrderItem'],
});

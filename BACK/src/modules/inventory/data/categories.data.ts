import {
  defineInitialData,
  namesByIndustry,
} from '../../../initial-data/initial-data.types';

export const INVENTORY_CATEGORIES_DATA = defineInitialData({
  name: 'inventory.categories',
  module: 'inventory',
  whenExisting: 'keep',
  versions: [
    {
      version: 1,
      items: namesByIndustry({
        ELECTRODOMESTICOS: [
          'Heladeras y Freezers',
          'Lavarropas y Secarropas',
          'Televisores y Monitores',
          'Cocinas y Hornos',
          'Aire Acondicionado y Calefacción',
          'Audio y Home Theater',
          'Pequeños Electrodomésticos',
          'Accesorios y Cables',
        ],
        FERRETERIA: [
          'Herramientas Manuales',
          'Herramientas Eléctricas',
          'Materiales de Construcción',
          'Pinturas y Revestimientos',
          'Plomería',
          'Electricidad',
          'Fijaciones y Tornillería',
          'Seguridad',
        ],
        SUPERMERCADO: [
          'Almacén',
          'Bebidas',
          'Lácteos y Huevos',
          'Carnes y Fiambres',
          'Frutas y Verduras',
          'Limpieza y Hogar',
          'Cuidado Personal',
          'Congelados',
        ],
        // Mezcla materia prima (madera, herrajes) con producto terminado propio.
        MUEBLERIA: [
          'Muebles Terminados',
          'Maderas y Tableros',
          'Herrajes y Fijaciones',
          'Adhesivos y Selladores',
          'Pinturas y Barnices',
          'Tapicería y Telas',
          'Insumos de Taller',
        ],
        SERVICIOS: ['Servicios', 'Insumos', 'Repuestos'],
        OTRO: ['General', 'Otros'],
      }),
    },
  ],
});

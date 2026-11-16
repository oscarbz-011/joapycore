// Grupos del catálogo en Ajustes → Módulos, en el orden en que se muestran.
export const MODULE_CATEGORIES = [
  'Inventario y Productos',
  'Ventas y CRM',
  'Compras y Proveedores',
  'Finanzas y Contabilidad',
  'Producción',
  'Logística',
  'Recursos Humanos',
  'Punto de Venta',
  'Proyectos',
  'Activos Fijos',
  'Documentos',
  'Herramientas y Sistema',
  'Integraciones',
] as const;

export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

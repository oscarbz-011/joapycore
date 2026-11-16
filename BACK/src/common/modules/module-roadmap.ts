import type { ModuleCategory } from './module-categories';

export interface RoadmapModule {
  displayName: string;
  description: string;
  icon: string;
  category: ModuleCategory;
}

// "Próximamente" en el catálogo: módulos que todavía no existen ni se pueden
// activar. Sirven para decidir cuáles construir y cuáles descartar.
export const MODULE_ROADMAP: readonly RoadmapModule[] = [
  {
    displayName: 'Automatización de Marketing',
    icon: 'Megaphone',
    category: 'Ventas y CRM',
    description:
      'Campañas de email/WhatsApp y seguimiento de leads automatizado',
  },
  {
    displayName: 'Cuentas por Pagar (AP)',
    icon: 'Receipt',
    category: 'Compras y Proveedores',
    description:
      'Registro y pago de facturas de proveedores, vencimientos y saldo por pagar',
  },
  {
    displayName: 'Cotizaciones a Proveedores',
    icon: 'FileQuestion',
    category: 'Compras y Proveedores',
    description:
      'Solicitar y comparar presupuestos de varios proveedores antes de comprar',
  },
  {
    displayName: 'Códigos de Barra y Etiquetas',
    icon: 'Barcode',
    category: 'Inventario y Productos',
    description:
      'Generación e impresión de códigos de barra y QR para productos',
  },
  {
    displayName: 'Contabilidad',
    icon: 'Landmark',
    category: 'Finanzas y Contabilidad',
    description: 'Libro mayor, partida doble y estados contables',
  },
  {
    displayName: 'Tesorería y Conciliación',
    icon: 'Wallet',
    category: 'Finanzas y Contabilidad',
    description: 'Conciliación de movimientos bancarios y flujo de caja',
  },
  {
    displayName: 'Multi-moneda',
    icon: 'Coins',
    category: 'Finanzas y Contabilidad',
    description: 'Precios y cobros en más de una moneda',
  },
  {
    displayName: 'Nómina Variable',
    icon: 'TrendingUp',
    category: 'Recursos Humanos',
    description: 'Comisiones, bonos por meta y reglas de cálculo por cargo',
  },
  {
    displayName: 'Control de Asistencia',
    icon: 'Fingerprint',
    category: 'Recursos Humanos',
    description: 'Marcación de entrada/salida y cálculo de horas trabajadas',
  },
  {
    displayName: 'Reclutamiento',
    icon: 'UserPlus',
    category: 'Recursos Humanos',
    description: 'Gestión de postulantes y procesos de selección',
  },
  {
    displayName: 'Impresión de Tickets',
    icon: 'Printer',
    category: 'Punto de Venta',
    description: 'Impresión de recibos y códigos de barra desde la caja',
  },
  {
    displayName: 'Rutas de Reparto',
    icon: 'Navigation',
    category: 'Logística',
    description: 'Planificación y seguimiento de rutas de entrega',
  },
  {
    displayName: 'Archivos Adjuntos',
    icon: 'Paperclip',
    category: 'Documentos',
    description:
      'Almacenamiento centralizado de archivos vinculados a clientes, ventas y compras',
  },
  {
    displayName: 'Firma Electrónica',
    icon: 'FileSignature',
    category: 'Documentos',
    description: 'Firma digital de contratos y documentos',
  },
  {
    displayName: 'Reportes Avanzados / BI',
    icon: 'BarChart3',
    category: 'Herramientas y Sistema',
    description:
      'Tableros y reportes personalizables más allá de los reportes básicos',
  },
  {
    displayName: 'Importación y Exportación',
    icon: 'Database',
    category: 'Herramientas y Sistema',
    description: 'Carga y descarga masiva de datos en Excel/CSV',
  },
  {
    displayName: 'Automatización de Flujos',
    icon: 'Workflow',
    category: 'Herramientas y Sistema',
    description: 'Reglas y flujos de trabajo configurables entre módulos',
  },
  {
    displayName: 'Pagos Online',
    icon: 'Globe',
    category: 'Integraciones',
    description: 'Pasarela de pago para cobrar ventas por internet',
  },
  {
    displayName: 'WhatsApp Business',
    icon: 'MessageCircle',
    category: 'Integraciones',
    description: 'Notificaciones y mensajes automáticos por WhatsApp',
  },
  {
    displayName: 'API y Webhooks',
    icon: 'Webhook',
    category: 'Integraciones',
    description: 'Integración con sistemas externos vía API pública',
  },
];

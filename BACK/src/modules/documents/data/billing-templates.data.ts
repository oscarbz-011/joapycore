import { TemplateKind } from '@prisma/client';
import {
  defineInitialData,
  type InitialDataItem,
} from '../../../initial-data/initial-data.types';
import {
  DEFAULT_INVOICE_TEMPLATE,
  DEFAULT_PAYMENT_RECEIPT_TEMPLATE,
} from '../constants/default-templates.constant';

export interface BillingTemplateItem extends InitialDataItem {
  key: TemplateKind;
  title: string;
  description: string;
  content: string;
}

// Editables desde Documentos aunque el módulo esté apagado: así la empresa
// puede revisarlas antes de emitir su primera factura.
export const BILLING_TEMPLATES_DATA = defineInitialData<BillingTemplateItem>({
  name: 'documents.billing-templates',
  module: 'billing',
  whenExisting: 'fill',
  versions: [
    {
      version: 1,
      items: [
        {
          key: TemplateKind.INVOICE,
          title: 'Factura (plantilla)',
          description:
            'Plantilla usada para generar el PDF al emitir una factura.',
          content: DEFAULT_INVOICE_TEMPLATE,
        },
        {
          key: TemplateKind.PAYMENT_RECEIPT,
          title: 'Recibo de dinero (plantilla)',
          description:
            'Plantilla usada para generar el PDF al cobrar una cuota.',
          content: DEFAULT_PAYMENT_RECEIPT_TEMPLATE,
        },
      ],
    },
  ],
});

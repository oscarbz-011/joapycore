import { defineInitialData } from '../../../initial-data/initial-data.types';

export const DOCUMENT_CATEGORIES_DATA = defineInitialData({
  name: 'documents.categories',
  module: 'documents',
  whenExisting: 'keep',
  versions: [
    {
      version: 1,
      items: [
        { key: 'Contratos Compra-Venta' },
        { key: 'Contratación de Personal' },
        { key: 'Políticas' },
        { key: 'FAQs' },
        { key: 'Otros' },
      ],
    },
  ],
});

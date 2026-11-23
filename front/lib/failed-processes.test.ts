import { describe, expect, it } from 'vitest';
import { processDocument, processKey, processLabel } from './failed-processes';

describe('processLabel', () => {
  it('names a known process in plain words', () => {
    expect(processLabel({ consumer: 'payments.receivable-from-invoice' })).toBe(
      'Crear la cuenta por cobrar de una factura',
    );
  });

  it('names the loading of the initial data of a company and of a module', () => {
    expect(processLabel({ consumer: 'initial-data.tenant-registered' })).toBe(
      'Cargar los datos iniciales de la empresa nueva',
    );
    expect(processLabel({ consumer: 'initial-data.module-activated' })).toBe(
      'Cargar los datos iniciales de un módulo activado',
    );
    expect(processLabel({ consumer: 'logistics.delivery-notes-on-activation' })).toBe(
      'Crear las entregas pendientes al activar Logística',
    );
  });

  it('never shows the internal name of an unknown process', () => {
    expect(processLabel({ consumer: 'something.new' })).toBe('Proceso automático');
    expect(processLabel({ consumer: null })).toBe('Procesar un movimiento automático');
  });
});

describe('processDocument', () => {
  it('links to the affected document', () => {
    expect(processDocument({ document: { type: 'invoice', id: 'inv-1' } })).toEqual({
      label: 'Factura',
      href: '/dashboard/billing/invoices/inv-1',
    });
    expect(processDocument({ document: { type: 'purchase-order', id: 'po-1' } })).toEqual({
      label: 'Orden de compra',
      href: '/dashboard/procurement/orders/po-1',
    });
  });

  it('has nothing to link without a document', () => {
    expect(processDocument({ document: null })).toBeNull();
  });
});

describe('processKey', () => {
  it('tells apart two processes of the same event', () => {
    expect(processKey({ eventId: 'e1', consumer: 'a' })).not.toBe(
      processKey({ eventId: 'e1', consumer: 'b' }),
    );
    expect(processKey({ eventId: 'e1', consumer: null })).toBe('e1:');
  });
});

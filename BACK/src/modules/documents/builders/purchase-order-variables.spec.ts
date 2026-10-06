import {
  buildPurchaseOrderVariables,
  type PurchaseOrderForPdf,
} from './purchase-order-variables';

function makeOrder(
  overrides: Partial<PurchaseOrderForPdf> = {},
): PurchaseOrderForPdf {
  return {
    id: 'po-1',
    orderNumber: 'OC-26-000007',
    orderDate: new Date('2026-10-06T00:00:00.000Z'),
    expectedDate: new Date('2026-10-20T00:00:00.000Z'),
    notes: 'Entregar por la mañana',
    tenant: {
      name: 'Mi Empresa',
      razonSocial: 'Mi Empresa S.A.',
      ruc: '80012345-6',
      address: 'Av. España 123',
      city: 'Asunción',
      phone: '021 123 456',
      email: 'compras@miempresa.com',
    },
    branch: null,
    supplier: {
      name: 'Importadora B',
      taxId: '800012341-2',
      address: 'Ruta 2 km 15',
      contactName: 'Roman Benitez',
      phone: '071 000 000',
      email: 'roman@mail.com',
      paymentTermDays: 30,
    },
    items: [
      {
        quantity: 12,
        unitCost: 10_000,
        supplierSku: '332726',
        supplierDescription: 'ABRIDOR DE VINHO SMARTFY',
        product: { name: 'Abridor de vino', unit: 'unidad' },
      },
      {
        quantity: 2,
        unitCost: 250_000,
        supplierSku: null,
        supplierDescription: null,
        product: { name: 'Ventilador', unit: 'unidad' },
      },
    ],
    ...overrides,
  };
}

describe('buildPurchaseOrderVariables', () => {
  it('identifies the buyer, the supplier and the order', () => {
    const { variables } = buildPurchaseOrderVariables(makeOrder());

    expect(variables).toMatchObject({
      'tenant.razonSocial': 'Mi Empresa S.A.',
      'tenant.ruc': '80012345-6',
      'tenant.email': 'compras@miempresa.com',
      'proveedor.nombre': 'Importadora B',
      'proveedor.ruc': '800012341-2',
      'proveedor.contacto': 'Roman Benitez',
      'orden.numero': 'OC-26-000007',
    });
  });

  // Las fechas de la orden son días de calendario: no se corren un día por la
  // zona horaria del servidor.
  it('prints the order dates as calendar days', () => {
    const { variables } = buildPurchaseOrderVariables(makeOrder());

    expect(variables['orden.fecha']).toBe('06/10/2026');
    expect(variables['orden.entregaEstimada']).toBe('20/10/2026');
  });

  it('describes the payment terms agreed with the supplier', () => {
    expect(
      buildPurchaseOrderVariables(makeOrder()).variables['orden.condicionPago'],
    ).toBe('Crédito a 30 días');

    const cash = makeOrder();
    cash.supplier.paymentTermDays = 0;
    expect(
      buildPurchaseOrderVariables(cash).variables['orden.condicionPago'],
    ).toBe('Contado');
  });

  it('delivers to the branch of the order when it has one', () => {
    expect(
      buildPurchaseOrderVariables(makeOrder()).variables['orden.lugarEntrega'],
    ).toBe('Av. España 123, Asunción');

    const { variables } = buildPurchaseOrderVariables(
      makeOrder({
        branch: {
          name: 'Sucursal Centro',
          address: 'Palma 500',
          city: 'Asunción',
        },
      }),
    );
    expect(variables['orden.lugarEntrega']).toBe(
      'Sucursal Centro — Palma 500, Asunción',
    );
  });

  // El proveedor reconoce su propio código y descripción; el nombre interno
  // solo se usa para lo que no salió de su catálogo.
  it('lists each line the way the supplier knows it', () => {
    const { tableVariables } = buildPurchaseOrderVariables(makeOrder());

    expect(tableVariables['orden.items']).toEqual({
      headers: [
        'Código',
        'Descripción',
        'Cant.',
        'Unidad',
        'Costo unit.',
        'Subtotal',
      ],
      rows: [
        [
          '332726',
          'ABRIDOR DE VINHO SMARTFY',
          '12',
          'unidad',
          'Gs. 10.000',
          'Gs. 120.000',
        ],
        ['—', 'Ventilador', '2', 'unidad', 'Gs. 250.000', 'Gs. 500.000'],
      ],
    });
  });

  it('totals the order in figures and in words', () => {
    const { variables } = buildPurchaseOrderVariables(makeOrder());

    expect(variables['orden.total']).toBe('620.000');
    expect(variables['orden.totalEnLetras']).toBe('SEISCIENTOS VEINTE MIL');
  });

  it('leaves blanks, not "null", for missing data', () => {
    const { variables } = buildPurchaseOrderVariables(
      makeOrder({
        orderNumber: null,
        expectedDate: null,
        notes: null,
        tenant: {
          name: 'Mi Empresa',
          razonSocial: null,
          ruc: null,
          address: null,
          city: null,
          phone: null,
          email: null,
        },
      }),
    );

    expect(variables['tenant.razonSocial']).toBe('Mi Empresa');
    expect(variables['orden.numero']).toBe('—');
    expect(variables['orden.entregaEstimada']).toBe('A convenir');
    expect(variables['orden.notas']).toBe('');
    expect(Object.values(variables).join(' ')).not.toMatch(/null|undefined/);
  });
});

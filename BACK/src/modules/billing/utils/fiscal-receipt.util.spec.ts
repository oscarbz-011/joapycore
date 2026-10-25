import { buildFiscalReceipt, InvoiceForReceipt } from './fiscal-receipt.util';

function makeInvoice(
  overrides: Partial<InvoiceForReceipt> = {},
): InvoiceForReceipt {
  return {
    id: 'inv-1',
    modality: 'SELF_PRINTED',
    invoicePrefix: '001-002-',
    invoiceNumber: '0000041',
    timbrado: '12345678',
    timbradoValidFrom: new Date('2026-01-01T00:00:00.000Z'),
    timbradoValidUntil: new Date('2026-12-31T00:00:00.000Z'),
    issuedAt: new Date('2026-06-15T15:00:00.000Z'),
    total: 267_000,
    anonymousBuyer: false,
    tenant: {
      name: 'Mi Empresa',
      razonSocial: 'Mi Empresa S.A.',
      nombreFantasia: 'MiTienda',
      ruc: '80069563-1',
      address: 'Av. España',
      numeroCasa: '123',
      city: 'Asunción',
      phone: '021 555 555',
      actividadesEconomicas: [
        { codigo: '47190', descripcion: 'Venta de electrodomésticos' },
      ],
    },
    saleOrder: {
      saleType: 'CASH',
      customer: {
        firstName: 'María',
        secondFirstName: 'Isabel',
        lastName: 'González',
        secondLastName: null,
        documentType: 'CI',
        documentNumber: '1234567',
        taxpayerType: null,
      },
      branch: {
        name: 'Central',
        address: 'Mcal. López',
        numeroCasa: '50',
        city: 'Asunción',
      },
    },
    items: [
      {
        description: 'Heladera',
        quantity: 1,
        unitPrice: 110_000,
        total: 110_000,
        ivaRate: 10,
        ivaAmount: 10_000,
      },
      {
        description: 'Arroz',
        quantity: 2,
        unitPrice: 52_500,
        total: 105_000,
        ivaRate: 5,
        ivaAmount: 5_000,
      },
      {
        description: 'Libro',
        quantity: 1,
        unitPrice: 30_000,
        total: 30_000,
        ivaRate: 0,
        ivaAmount: 0,
      },
      {
        description: 'Flete',
        quantity: 1,
        unitPrice: 22_000,
        total: 22_000,
        ivaRate: 10,
        ivaAmount: null,
      },
    ],
    ...overrides,
  };
}

describe('buildFiscalReceipt', () => {
  it('prints the issuer, the timbrado and the 13-digit number', () => {
    const receipt = buildFiscalReceipt(makeInvoice());

    expect(receipt).toMatchObject({
      number: '001-002-0000041',
      timbrado: '12345678',
      condition: 'CONTADO',
      issuer: {
        name: 'Mi Empresa S.A.',
        fantasyName: 'MiTienda',
        ruc: '80069563-1',
        address: 'Av. España 123',
        activity: 'Venta de electrodomésticos',
        branchName: 'Central',
        branchAddress: 'Mcal. López 50, Asunción',
      },
    });
  });

  it('adds up each IVA rate and the liquidation', () => {
    expect(buildFiscalReceipt(makeInvoice()).totals).toEqual({
      exempt: 30_000,
      taxed5: 105_000,
      taxed10: 132_000,
      iva5: 5_000,
      iva10: 12_000,
      ivaTotal: 17_000,
      total: 267_000,
    });
  });

  it('names a person with their identity document', () => {
    expect(buildFiscalReceipt(makeInvoice()).buyer).toEqual({
      name: 'María Isabel González',
      document: 'CI 1234567',
    });
  });

  it('names a company by its legal name and RUC', () => {
    const invoice = makeInvoice();
    invoice.saleOrder!.customer = {
      ...invoice.saleOrder!.customer,
      firstName: 'TIPS S.A.',
      lastName: '',
      secondFirstName: null,
      documentType: 'RUC',
      documentNumber: '80069563-1',
      taxpayerType: 'COMPANY',
    };
    expect(buildFiscalReceipt(invoice).buyer).toEqual({
      name: 'TIPS S.A.',
      document: 'RUC 80069563-1',
    });
  });

  it('prints "Sin Nombre" and an X for an unidentified final consumer', () => {
    expect(
      buildFiscalReceipt(makeInvoice({ anonymousBuyer: true })).buyer,
    ).toEqual({ name: 'Sin Nombre', document: 'X' });
  });
});

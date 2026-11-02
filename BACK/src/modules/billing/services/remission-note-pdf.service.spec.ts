import {
  RemissionNotePdfService,
  remissionCopies,
  remissionVariables,
} from './remission-note-pdf.service';

const note = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'rn-1',
    modality: 'SELF_PRINTED',
    pdfFileId: null,
    motive: 'BRANCH_TRANSFER',
    motiveDetail: null,
    numberPrefix: '001-002-',
    number: '0000007',
    timbrado: '12345678',
    timbradoValidFrom: new Date('2026-01-01T00:00:00.000Z'),
    timbradoValidUntil: new Date('2027-12-31T00:00:00.000Z'),
    issuedAt: new Date('2026-11-03T13:00:00.000Z'),
    recipientName: 'Electro SA',
    recipientDocument: 'RUC 80000001-1',
    originAddress: 'Palma 500',
    originCity: 'Asunción',
    originDepartment: 'Capital',
    destinationAddress: 'Ruta 2 km 20',
    destinationCity: 'Capiatá',
    destinationDepartment: 'Central',
    transportType: 'OWN',
    vehicleBrand: 'Toyota',
    vehiclePlate: 'AAA123',
    trailerPlate: null,
    carrierName: 'Electro SA',
    carrierRuc: '80000001-1',
    carrierAddress: 'Palma 500',
    driverName: 'Juan Pérez',
    driverDocument: '1234567',
    driverAddress: 'Luque',
    transportStartDate: new Date('2026-11-03T00:00:00.000Z'),
    transportEndDate: new Date('2026-11-04T00:00:00.000Z'),
    notes: null,
    invoice: null,
    branch: {
      id: 'br-1',
      name: 'Centro',
      address: 'Palma',
      numeroCasa: '500',
      city: 'Asunción',
    },
    tenant: {
      name: 'Electro',
      razonSocial: 'Electro SA',
      nombreFantasia: null,
      ruc: '80000001-1',
      address: 'Palma',
      numeroCasa: '500',
      city: 'Asunción',
      phone: '021 000',
      actividadesEconomicas: [{ descripcion: 'Venta de electrodomésticos' }],
      logoFileId: null,
    },
    items: [
      {
        quantity: 2,
        unit: 'unidad',
        description: 'Televisor LG',
        serialNumbers: ['SN-1', 'SN-2'],
      },
    ],
    ...overrides,
  }) as any;

describe('remission note PDF', () => {
  it('prints three copies, and the carrier one only for contracted freight', () => {
    expect(remissionCopies(note())).toEqual([
      'ORIGINAL: DESTINATARIO',
      'COPIA: REMITENTE',
      'COPIA: ADMINISTRACIÓN TRIBUTARIA',
    ]);
    expect(
      remissionCopies(note({ transportType: 'THIRD_PARTY' })),
    ).toHaveLength(4);
  });

  it('fills the data of art. 33', () => {
    const vars = remissionVariables(note());
    expect(vars).toEqual(
      expect.objectContaining({
        'nota.numero': '001-002-0000007',
        'nota.motivo': 'Traslado entre locales de la misma empresa',
        'nota.comprobante': 'No corresponde',
        'timbrado.finVigencia': '31/12/2027',
        'traslado.inicio': '03/11/2026',
        'traslado.fin': '04/11/2026',
        'vehiculo.remolque': '',
        'tenant.actividad': 'Venta de electrodomésticos',
      }),
    );
  });

  it('cites the invoice of a sale and the detail of "Otros"', () => {
    const vars = remissionVariables(
      note({
        motive: 'OTHER',
        motiveDetail: 'Préstamo de exhibidor',
        invoice: {
          id: 'inv-1',
          invoicePrefix: '001-001-',
          invoiceNumber: '0000009',
          timbrado: '87654321',
          issuedAt: new Date('2026-11-01T13:00:00.000Z'),
        },
      }),
    );
    expect(vars['nota.motivo']).toBe('Otros: Préstamo de exhibidor');
    expect(vars['nota.comprobante']).toBe(
      'Factura N° 001-001-0000009 · Timbrado 87654321 · 01/11/2026',
    );
  });

  it('renders every copy and saves the file once', async () => {
    const notes = {
      findForPrint: jest
        .fn()
        .mockResolvedValue(note({ transportType: 'THIRD_PARTY' })),
      setPdf: jest.fn(),
    };
    const files = {
      upload: jest.fn().mockResolvedValue({ id: 'file-1' }),
      getById: jest.fn(),
    };
    const pdf = {
      renderHtmlTemplate: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    const service = new RemissionNotePdfService(
      notes as any,
      files as any,
      pdf as any,
    );

    await expect(service.generate('tenant-1', 'rn-1', 'user-1')).resolves.toBe(
      'file-1',
    );
    const [html, , tables] = pdf.renderHtmlTemplate.mock.calls[0];
    expect((html as string).match(/class="page"/g)).toHaveLength(4);
    expect(html).toContain('COPIA: TRANSPORTISTA');
    expect(tables['nota.items'].rows).toEqual([
      ['2', 'unidad', 'Televisor LG', 'SN-1, SN-2'],
    ]);
    expect(files.upload).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      expect.objectContaining({
        originalname: 'nota-de-remision-001-002-0000007.pdf',
      }),
      { module: 'billing', entityType: 'RemissionNote', entityId: 'rn-1' },
    );
    expect(notes.setPdf).toHaveBeenCalledWith('tenant-1', 'rn-1', 'file-1');
  });

  it('does not make a PDF for a talonario note or twice', async () => {
    const pdf = { renderHtmlTemplate: jest.fn() };
    const notes = {
      findForPrint: jest
        .fn()
        .mockResolvedValue(note({ modality: 'PREPRINTED' })),
    };
    const service = new RemissionNotePdfService(
      notes as any,
      {} as any,
      pdf as any,
    );
    await expect(
      service.generate('tenant-1', 'rn-1', null),
    ).resolves.toBeNull();
    notes.findForPrint.mockResolvedValue(note({ pdfFileId: 'file-0' }));
    await expect(service.generate('tenant-1', 'rn-1', null)).resolves.toBe(
      'file-0',
    );
    expect(pdf.renderHtmlTemplate).not.toHaveBeenCalled();
  });
});

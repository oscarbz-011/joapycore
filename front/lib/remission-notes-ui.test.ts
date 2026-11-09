import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RemissionNote,
  RemissionNoteDetail,
  SaleRemissionOptions,
  TransferOptions,
} from './api/remission-notes';

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  data: {} as Record<string, unknown>,
  search: '' as string,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
  useParams: () => ({ id: 'inv-1' }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    jwtPayload: { sub: 'me', tenantId: 'tenant-1', permissions: state.permissions, activeModules: ['billing'] },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: state.data[queryKey.filter((k) => typeof k === 'string' && k !== 'inv-1').join('/')],
    isLoading: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ isPending: false, isError: false, error: null, mutate: () => undefined }),
}));

const { default: TransferPage } = await import('@/app/(dashboard)/dashboard/billing/remission-notes/new/page');
const { default: SalePage } = await import('@/app/(dashboard)/dashboard/billing/invoices/[id]/remission-note/page');
const { default: DetailPage } = await import('@/app/(dashboard)/dashboard/billing/remission-notes/[id]/page');
const { default: ReceivePage } = await import('@/app/(dashboard)/dashboard/billing/remission-notes/[id]/receive/page');
const { RemissionNotesTab } = await import('@/components/billing/remission-notes-tab');

function render<P extends object>(type: ComponentType<P>, props: P): string {
  return renderToStaticMarkup(createElement(type, props));
}

const SERIES = {
  id: 'series-rn',
  branchId: 'br-1',
  documentType: 'REMISSION_NOTE',
  modality: 'SELF_PRINTED',
  timbrado: '12345678',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2099-12-31T00:00:00.000Z',
  establecimiento: '001',
  puntoExpedicion: '003',
  serieCode: '',
  rangeFrom: 1,
  rangeTo: 500,
  nextNumber: 7,
  isActive: true,
  printLayout: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  branch: { id: 'br-1', name: 'Centro' },
  _count: { invoices: 0, remissionNotes: 6 },
  problem: null,
};

const COMPANY = { name: 'Electro SA', ruc: '80000001-1', address: 'Palma 500, Asunción' };
const place = (city: string) => ({ address: 'Palma 500', city, department: 'Capital' });

const TRANSFER_OPTIONS: TransferOptions = {
  company: COMPANY,
  warehouses: [
    { id: 'wh-a', name: 'Central', branch: { id: 'br-1', name: 'Centro' }, place: place('Asunción') },
    { id: 'wh-b', name: 'Depósito Capiatá', branch: { id: 'br-2', name: 'Capiatá' }, place: place('Capiatá') },
    { id: 'wh-x', name: 'Galpón', branch: null, place: place('') },
  ],
  series: [SERIES as never],
};

beforeEach(() => {
  state.permissions = ['billing:issue', 'billing:cancel', 'billing:read'];
  state.data = {};
  state.search = '';
});

describe('transfer between branches', () => {
  it('asks for the warehouses first', () => {
    state.data['remission-notes/transfer-options'] = TRANSFER_OPTIONS;
    const html = render(TransferPage, {});
    expect(html).toContain('Traslado entre sucursales');
    expect(html).toContain('Elegí un depósito');
    expect(html).toContain('Elegí el depósito de origen y el de destino');
    expect(html).toContain('Vehículo propio');
  });

  it('lists the goods of the origin and numbers with its branch series', () => {
    state.search = 'from=wh-a&to=wh-b';
    state.data['remission-notes/transfer-options'] = TRANSFER_OPTIONS;
    state.data['remission-notes/transfer-stock/wh-a'] = [
      { productId: 'p-rice', description: 'Arroz', unit: 'kg', isSerialized: false, quantity: 10, serialNumbers: [] },
      { productId: 'p-tv', description: 'Televisor LG', unit: 'unidad', isSerialized: true, quantity: 1, serialNumbers: ['SN-1'] },
    ];
    const html = render(TransferPage, {});
    expect(html).toContain('Central · Centro');
    expect(html).toContain('Depósito Capiatá · Capiatá');
    expect(html).toContain('Arroz');
    expect(html).toContain('SN-1');
    expect(html).toContain('Elegí qué mercadería se traslada');
    expect(html).toContain('Emitir nota y despachar');
    expect(html).toContain('queda en tránsito');
  });

  it('asks to put the origin warehouse in a branch', () => {
    state.search = 'from=wh-x&to=wh-b';
    state.data['remission-notes/transfer-options'] = TRANSFER_OPTIONS;
    state.data['remission-notes/transfer-stock/wh-x'] = [];
    const html = render(TransferPage, {});
    expect(html).toContain('no pertenece a una sucursal');
    expect(html).toContain('se numera con la serie de la sucursal');
  });

  it('hides the issue button without permission', () => {
    state.permissions = ['billing:read'];
    state.data['remission-notes/transfer-options'] = TRANSFER_OPTIONS;
    expect(render(TransferPage, {})).not.toContain('Emitir nota y despachar</button>');
  });
});

describe('sale', () => {
  const options: SaleRemissionOptions = {
    invoice: { id: 'inv-1', number: '001-001-0000009', issuedAt: '2026-11-01T13:00:00.000Z', anonymousBuyer: false },
    recipient: { name: 'María Pérez', document: 'CI 1234567' },
    origin: place('Asunción'),
    destination: { address: 'Barrio Obrero', city: 'Asunción', department: '' },
    company: COMPANY,
    items: [
      {
        invoiceItemId: 'ii-rice',
        productId: 'p-rice',
        description: 'Arroz',
        unit: 'kg',
        quantity: 10,
        remitted: 4,
        remitable: 6,
        isSerialized: false,
        soldSerials: [],
      },
    ],
    series: [SERIES as never],
  };

  it('suggests the recipient and shows what is left to send', () => {
    state.data['invoice/remission-options'] = options;
    const html = render(SalePage, {});
    expect(html).toContain('Nota de remisión');
    expect(html).toContain('Es opcional');
    expect(html).toContain('value="María Pérez"');
    expect(html).toContain('Ya enviado');
    expect(html).toContain('Por enviar');
    expect(html).toMatch(/>4<\/td><td[^>]*>6<\/td>/);
    expect(html).toContain('Emitir nota de remisión');
  });

  it('says when everything already left', () => {
    state.data['invoice/remission-options'] = {
      ...options,
      items: [{ ...options.items[0], remitted: 10, remitable: 0 }],
    };
    expect(render(SalePage, {})).toContain('ya salió con otras notas de remisión');
  });

  it('warns that a "Sin Nombre" invoice needs a recipient', () => {
    state.data['invoice/remission-options'] = {
      ...options,
      invoice: { ...options.invoice, anonymousBuyer: true },
      recipient: { name: '', document: '' },
    };
    const html = render(SalePage, {});
    expect(html).toContain('identifica a quien recibe');
    expect(html).toContain('Cargá el nombre del destinatario');
  });
});

const NOTE: RemissionNoteDetail = {
  id: 'rn-1',
  number: '0000007',
  numberPrefix: '001-003-',
  motive: 'BRANCH_TRANSFER',
  status: 'ISSUED',
  transitStatus: 'IN_TRANSIT',
  receivedAt: null,
  modality: 'SELF_PRINTED',
  issuedAt: '2026-11-03T13:00:00.000Z',
  recipientName: 'Electro SA',
  transportStartDate: '2026-11-03T00:00:00.000Z',
  transportEndDate: '2026-11-04T00:00:00.000Z',
  createdAt: '2026-11-03T13:00:00.000Z',
  branch: { id: 'br-1', name: 'Centro' },
  invoice: null,
  fromWarehouse: { id: 'wh-a', name: 'Central', branch: { id: 'br-1', name: 'Centro' } },
  toWarehouse: { id: 'wh-b', name: 'Depósito Capiatá', branch: { id: 'br-2', name: 'Capiatá' } },
  _count: { items: 1 },
  motiveDetail: null,
  customerId: null,
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
  notes: null,
  timbrado: '12345678',
  timbradoValidFrom: '2026-01-01T00:00:00.000Z',
  timbradoValidUntil: '2099-12-31T00:00:00.000Z',
  sequential: 7,
  issuedById: 'me',
  voidedAt: null,
  voidReason: null,
  receivedById: null,
  receptionNotes: null,
  pdfFileId: 'file-1',
  physicalScan: null,
  items: [
    {
      id: 'rni-1',
      productId: 'p-tv',
      invoiceItemId: null,
      description: 'Televisor LG',
      unit: 'unidad',
      quantity: 1,
      serialNumbers: ['SN-1'],
      receivedQuantity: null,
      receivedSerials: [],
    },
    {
      id: 'rni-2',
      productId: 'p-rice',
      invoiceItemId: null,
      description: 'Arroz',
      unit: 'kg',
      quantity: 10,
      serialNumbers: [],
      receivedQuantity: null,
      receivedSerials: [],
    },
  ],
  events: [
    {
      id: 'e-1',
      type: 'REMISSION_NOTE_ISSUED',
      detail: { number: '001-003-0000007' },
      userId: 'me',
      createdAt: '2026-11-03T13:00:00.000Z',
      creditNoteId: null,
      remissionNoteId: 'rn-1',
    },
  ],
};

describe('detail', () => {
  it('shows the transfer, the transport and the history', () => {
    state.data['remission-note'] = NOTE;
    const html = render(DetailPage, {});
    expect(html).toContain('001-003-0000007');
    expect(html).toContain('Vigente');
    expect(html).toContain('Traslado entre sucursales');
    expect(html).toContain('Depósito Capiatá');
    expect(html).toContain('AAA123');
    expect(html).toContain('SN-1');
    expect(html).toContain('Nota de remisión emitida');
    expect(html).toContain('Imprimir / descargar PDF');
    expect(html).toContain('Anular nota de remisión');
    expect(html).toContain('En tránsito');
    expect(html).toContain('no está disponible en ninguno de los dos');
  });

  it('offers to receive a transfer only with inventory permission', () => {
    state.data['remission-note'] = NOTE;
    state.permissions = ['billing:read', 'inventory:movements:create'];
    expect(render(DetailPage, {})).toContain('Registrar recepción');
    state.permissions = ['billing:read'];
    expect(render(DetailPage, {})).not.toContain('Registrar recepción');
  });

  it('shows what arrived and what was missing, and no longer voids it', () => {
    state.data['remission-note'] = {
      ...NOTE,
      transitStatus: 'RECEIVED_WITH_DIFFERENCES',
      receivedAt: '2026-11-04T15:00:00.000Z',
      receptionNotes: 'Faltaron 2 bolsas',
      items: [
        { ...NOTE.items[0], receivedQuantity: 1, receivedSerials: ['SN-1'] },
        { ...NOTE.items[1], receivedQuantity: 8 },
      ],
    };
    const html = render(DetailPage, {});
    expect(html).toContain('Recibida con faltantes');
    expect(html).toContain('Faltaron 2 bolsas');
    expect(html).toContain('Faltó');
    expect(html).toMatch(/>8<\/td><td[^>]*>2<\/td>/);
    expect(html).not.toContain('Anular nota de remisión');
    expect(html).not.toContain('Registrar recepción');
  });

  it('asks for the scan of a talonario note and does not void without permission', () => {
    state.permissions = ['billing:read', 'billing:issue'];
    state.data['remission-note'] = { ...NOTE, modality: 'PREPRINTED', pdfFileId: null };
    const html = render(DetailPage, {});
    expect(html).toContain('Hoja del talonario');
    expect(html).toContain('se llena a mano');
    expect(html).not.toContain('Generar PDF');
    expect(html).not.toContain('Anular nota de remisión');
  });

  it('shows why it was voided', () => {
    state.data['remission-note'] = {
      ...NOTE,
      status: 'VOIDED',
      voidedAt: '2026-11-03T15:00:00.000Z',
      voidReason: 'El camión no salió',
    };
    const html = render(DetailPage, {});
    expect(html).toContain('Anulada');
    expect(html).toContain('El camión no salió');
    expect(html).not.toContain('Anular nota de remisión');
  });
});

describe('list', () => {
  it('lists each note with where it went', () => {
    state.data['remission-notes'] = [NOTE as RemissionNote];
    const html = render(RemissionNotesTab, {});
    expect(html).toContain('001-003-0000007');
    expect(html).toContain('Depósito Capiatá (Capiatá)');
    expect(html).toContain('Traslado entre sucursales');
  });

  it('explains when there are none', () => {
    state.data['remission-notes'] = [];
    expect(render(RemissionNotesTab, {})).toContain('obligatorias para trasladar mercadería entre sucursales');
  });
});

describe('reception', () => {
  it('starts with everything arrived and lets the serial numbers be unchecked', () => {
    state.permissions = ['billing:read', 'inventory:movements:create'];
    state.data['remission-note'] = NOTE;
    const html = render(ReceivePage, {});
    expect(html).toContain('Recibir mercadería');
    expect(html).toContain('De Central a Depósito Capiatá');
    expect(html).toContain('Llegó todo lo despachado');
    expect(html).toContain('Números de serie que llegaron (1 de 1)');
    expect(html).toContain('value="10"');
    expect(html).toContain('Confirmar recepción');
  });

  it('does not receive twice', () => {
    state.data['remission-note'] = { ...NOTE, transitStatus: 'RECEIVED' };
    const html = render(ReceivePage, {});
    expect(html).toContain('ya está recibida');
    expect(html).not.toContain('Confirmar recepción');
  });

  it('hides the button without inventory permission', () => {
    state.permissions = ['billing:read'];
    state.data['remission-note'] = NOTE;
    expect(render(ReceivePage, {})).not.toContain('Confirmar recepción</button>');
  });
});

describe('list in transit', () => {
  it('counts the transfers waiting at their destination', () => {
    state.data['remission-notes'] = [NOTE as RemissionNote, { ...NOTE, id: 'rn-2', transitStatus: 'RECEIVED' } as RemissionNote];
    const html = render(RemissionNotesTab, {});
    expect(html).toContain('1 traslado en tránsito');
    expect(html).toContain('Recibida');
  });
});

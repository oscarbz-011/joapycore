import { describe, expect, it } from 'vitest';
import type { RemitableItem, TransferStockRow } from './api/remission-notes';
import {
  canReceiveRemission,
  canVoidRemission,
  fullReception,
  missingUnits,
  receptionPayload,
  receptionProblem,
  emptyRemissionDraft,
  remissionDestination,
  remissionDraftProblem,
  remissionNoteNumber,
  remissionOrigin,
  remissionPayloadBase,
  saleLinesProblem,
  salePayloadItems,
  todayInParaguay,
  transferLinesProblem,
  transferPayloadItems,
} from './remission-notes';

const COMPANY = { name: 'Electro SA', ruc: '80000001-1', address: 'Palma 500, Asunción' };
const TODAY = '2026-11-03';
const PLACE = { address: 'Palma 500', city: 'Asunción', department: 'Capital' };

const complete = () => {
  const draft = emptyRemissionDraft(COMPANY, TODAY, { origin: PLACE, destination: { ...PLACE, city: 'Capiatá' } });
  draft.transport = {
    ...draft.transport,
    vehicleBrand: 'Toyota',
    vehiclePlate: 'AAA123',
    driverName: 'Juan Pérez',
    driverDocument: '1234567',
    driverAddress: 'Luque',
  };
  return draft;
};

describe('labels', () => {
  const transfer = {
    motive: 'BRANCH_TRANSFER' as const,
    numberPrefix: '001-002-',
    number: '0000007',
    recipientName: 'Electro SA',
    branch: { id: 'br-1', name: 'Centro' },
    fromWarehouse: { id: 'wh-a', name: 'Central', branch: { id: 'br-1', name: 'Centro' } },
    toWarehouse: { id: 'wh-b', name: 'Depósito Capiatá', branch: { id: 'br-2', name: 'Capiatá' } },
  };

  it('shows the 13-digit number, where it leaves from and where it goes', () => {
    expect(remissionNoteNumber(transfer)).toBe('001-002-0000007');
    expect(remissionOrigin(transfer)).toBe('Central');
    expect(remissionDestination(transfer)).toBe('Depósito Capiatá (Capiatá)');
  });

  it('goes to the recipient in a sale and leaves from the branch', () => {
    const sale = { ...transfer, motive: 'SALE' as const, recipientName: 'María Pérez', fromWarehouse: null, toWarehouse: null };
    expect(remissionDestination(sale)).toBe('María Pérez');
    expect(remissionOrigin(sale)).toBe('Centro');
  });

  it('voids a sale while valid and a transfer only while in transit', () => {
    expect(canVoidRemission({ status: 'ISSUED', transitStatus: null })).toBe(true);
    expect(canVoidRemission({ status: 'ISSUED', transitStatus: 'IN_TRANSIT' })).toBe(true);
    expect(canVoidRemission({ status: 'ISSUED', transitStatus: 'RECEIVED' })).toBe(false);
    expect(canVoidRemission({ status: 'VOIDED', transitStatus: null })).toBe(false);
  });

  it('receives only a transfer in transit', () => {
    expect(canReceiveRemission({ status: 'ISSUED', transitStatus: 'IN_TRANSIT' })).toBe(true);
    expect(canReceiveRemission({ status: 'ISSUED', transitStatus: 'RECEIVED_WITH_DIFFERENCES' })).toBe(false);
    expect(canReceiveRemission({ status: 'VOIDED', transitStatus: 'IN_TRANSIT' })).toBe(false);
    expect(canReceiveRemission({ status: 'ISSUED', transitStatus: null })).toBe(false);
  });

  it('uses the day in Paraguay', () => {
    // 02/11 23:30 en Asunción ya es 03/11 en UTC.
    expect(todayInParaguay(new Date('2026-11-03T02:30:00.000Z'))).toBe('2026-11-02');
  });
});

describe('draft of art. 33', () => {
  it('starts with own transport and the company as carrier', () => {
    const draft = emptyRemissionDraft(COMPANY, TODAY);
    expect(draft.transport).toMatchObject({
      type: 'OWN',
      carrierName: 'Electro SA',
      carrierRuc: '80000001-1',
      startDate: TODAY,
      endDate: TODAY,
    });
  });

  it('is ready when every piece is there', () => {
    expect(remissionDraftProblem(complete(), TODAY)).toBeNull();
  });

  it.each([
    [(d: ReturnType<typeof complete>) => (d.origin = { ...d.origin, department: '' }), 'departamento del punto de partida'],
    [(d: ReturnType<typeof complete>) => (d.destination = { ...d.destination, address: '' }), 'dirección del punto de llegada'],
    [(d: ReturnType<typeof complete>) => (d.transport.startDate = '2026-11-02'), 'antes de hoy'],
    [(d: ReturnType<typeof complete>) => (d.transport.endDate = '2026-11-01'), 'terminar antes de empezar'],
    [(d: ReturnType<typeof complete>) => (d.transport.vehiclePlate = ''), 'chapa o el RUA'],
    [(d: ReturnType<typeof complete>) => (d.transport.carrierRuc = ''), 'RUC del transportista'],
    [(d: ReturnType<typeof complete>) => (d.transport.driverDocument = ''), 'cédula del conductor'],
  ])('asks for what is missing (%#)', (breakIt, message) => {
    const draft = complete();
    breakIt(draft);
    expect(remissionDraftProblem(draft, TODAY)).toContain(message);
  });

  it('sends the transport trimmed and without an empty trailer', () => {
    const draft = complete();
    draft.transport.driverName = '  Juan Pérez ';
    draft.notes = ' Frágil ';
    const payload = remissionPayloadBase(draft);
    expect(payload.transport.driverName).toBe('Juan Pérez');
    expect(payload.transport).not.toHaveProperty('trailerPlate');
    expect(payload.notes).toBe('Frágil');
    expect(remissionPayloadBase(complete())).not.toHaveProperty('notes');
  });
});

const STOCK: TransferStockRow[] = [
  { productId: 'p-rice', description: 'Arroz', unit: 'kg', isSerialized: false, quantity: 10, serialNumbers: [] },
  { productId: 'p-tv', description: 'Televisor', unit: 'unidad', isSerialized: true, quantity: 2, serialNumbers: ['SN-1', 'SN-2'] },
];

describe('transfer lines', () => {
  it('needs goods and no more than the origin has', () => {
    expect(transferLinesProblem(STOCK, {})).toContain('Elegí qué mercadería');
    expect(transferLinesProblem(STOCK, { 'p-rice': { quantity: 11, serialNumbers: [] } })).toContain('hay 10');
    expect(transferLinesProblem(STOCK, { 'p-tv': { quantity: 0, serialNumbers: ['SN-1'] } })).toBeNull();
  });

  it('sends serialized goods by their serial numbers', () => {
    expect(
      transferPayloadItems(STOCK, {
        'p-rice': { quantity: 4, serialNumbers: [] },
        'p-tv': { quantity: 0, serialNumbers: ['SN-2'] },
      }),
    ).toEqual([
      { productId: 'p-rice', quantity: 4 },
      { productId: 'p-tv', quantity: 1, serialNumbers: ['SN-2'] },
    ]);
  });
});

const ITEMS: RemitableItem[] = [
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
  {
    invoiceItemId: 'ii-tv',
    productId: 'p-tv',
    description: 'Televisor',
    unit: 'unidad',
    quantity: 1,
    remitted: 0,
    remitable: 1,
    isSerialized: true,
    soldSerials: ['SN-9'],
  },
];

describe('sale lines', () => {
  it('needs goods and no more than what is left to send', () => {
    expect(saleLinesProblem(ITEMS, {})).toContain('Elegí qué mercadería');
    expect(saleLinesProblem(ITEMS, { 'ii-rice': { quantity: 7, serialNumbers: [] } })).toContain('quedan 6');
  });

  it('builds the items of the invoice', () => {
    expect(
      salePayloadItems(ITEMS, {
        'ii-rice': { quantity: 6, serialNumbers: [] },
        'ii-tv': { quantity: 0, serialNumbers: ['SN-9'] },
      }),
    ).toEqual([
      { invoiceItemId: 'ii-rice', quantity: 6 },
      { invoiceItemId: 'ii-tv', quantity: 1, serialNumbers: ['SN-9'] },
    ]);
  });
});

describe('reception', () => {
  const ITEMS_SENT = [
    { id: 'it-rice', description: 'Arroz', quantity: 5, serialNumbers: [] },
    { id: 'it-tv', description: 'Televisor', quantity: 2, serialNumbers: ['SN-1', 'SN-2'] },
  ];

  it('starts with everything arrived', () => {
    const lines = fullReception(ITEMS_SENT);
    expect(missingUnits(ITEMS_SENT, lines)).toBe(0);
    expect(receptionProblem(ITEMS_SENT, lines, '')).toBeNull();
    expect(receptionPayload(ITEMS_SENT, lines, '')).toEqual({
      items: [
        { itemId: 'it-rice', receivedQuantity: 5 },
        { itemId: 'it-tv', receivedQuantity: 2, receivedSerials: ['SN-1', 'SN-2'] },
      ],
    });
  });

  it('counts what is missing and asks to explain it', () => {
    const lines = {
      'it-rice': { quantity: 3, serialNumbers: [] },
      'it-tv': { quantity: 0, serialNumbers: ['SN-2'] },
    };
    expect(missingUnits(ITEMS_SENT, lines)).toBe(3);
    expect(receptionProblem(ITEMS_SENT, lines, '')).toContain('explicá la diferencia');
    expect(receptionProblem(ITEMS_SENT, lines, 'Faltó una caja')).toBeNull();
    expect(receptionPayload(ITEMS_SENT, lines, ' Faltó una caja ')).toEqual({
      items: [
        { itemId: 'it-rice', receivedQuantity: 3 },
        { itemId: 'it-tv', receivedQuantity: 1, receivedSerials: ['SN-2'] },
      ],
      notes: 'Faltó una caja',
    });
  });

  it('does not accept more than was sent', () => {
    const lines = { ...fullReception(ITEMS_SENT), 'it-rice': { quantity: 6, serialNumbers: [] } };
    expect(receptionProblem(ITEMS_SENT, lines, '')).toContain('no pueden llegar más');
  });
});

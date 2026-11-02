import type {
  RemissionCompany,
  RemissionMotive,
  RemissionNote,
  RemissionPlace,
  RemissionTransportPayload,
  RemitableItem,
  TransferStockRow,
  TransportType,
} from './api/remission-notes';

export const REMISSION_MOTIVE_LABELS: Record<RemissionMotive, string> = {
  SALE: 'Venta',
  CONSIGNMENT: 'Consignación',
  EXPORT: 'Exportación',
  PURCHASE: 'Compra',
  IMPORT: 'Importación',
  RETURN: 'Devolución',
  BRANCH_TRANSFER: 'Traslado entre sucursales',
  TRANSFORMATION: 'Para transformación',
  REPAIR: 'Para reparación',
  MOBILE_ISSUER: 'Emisor móvil',
  EXHIBITION: 'Exhibición o demostración',
  TRADE_FAIR: 'Participación en ferias',
  OTHER: 'Otros',
};

export const TRANSPORT_TYPE_LABELS: Record<TransportType, string> = {
  OWN: 'Vehículo propio',
  THIRD_PARTY: 'Transportista contratado',
};

export function remissionNoteNumber(note: Pick<RemissionNote, 'numberPrefix' | 'number'>): string {
  return `${note.numberPrefix}${note.number}`;
}

/** Hacia dónde fue la mercadería, en una línea. */
export function remissionDestination(
  note: Pick<RemissionNote, 'motive' | 'toWarehouse' | 'recipientName'>,
): string {
  if (note.motive === 'BRANCH_TRANSFER' && note.toWarehouse) {
    return note.toWarehouse.branch
      ? `${note.toWarehouse.name} (${note.toWarehouse.branch.name})`
      : note.toWarehouse.name;
  }
  return note.recipientName;
}

export function remissionOrigin(note: Pick<RemissionNote, 'fromWarehouse' | 'branch'>): string {
  return note.fromWarehouse?.name ?? note.branch.name;
}

/** "Hoy" en Paraguay como AAAA-MM-DD, para las fechas del traslado. */
export function todayInParaguay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export interface TransportDraft {
  type: TransportType;
  vehicleBrand: string;
  vehiclePlate: string;
  trailerPlate: string;
  carrierName: string;
  carrierRuc: string;
  carrierAddress: string;
  driverName: string;
  driverDocument: string;
  driverAddress: string;
  startDate: string;
  endDate: string;
}

export interface RemissionDraft {
  origin: RemissionPlace;
  destination: RemissionPlace;
  transport: TransportDraft;
  notes: string;
}

const EMPTY_PLACE: RemissionPlace = { address: '', city: '', department: '' };

/** Con vehículo propio, el transportista es la empresa. */
export function ownCarrier(company: RemissionCompany) {
  return {
    carrierName: company.name,
    carrierRuc: company.ruc,
    carrierAddress: company.address,
  };
}

export function emptyRemissionDraft(
  company: RemissionCompany,
  today: string,
  places: { origin?: RemissionPlace; destination?: RemissionPlace } = {},
): RemissionDraft {
  return {
    origin: places.origin ?? EMPTY_PLACE,
    destination: places.destination ?? EMPTY_PLACE,
    transport: {
      type: 'OWN',
      vehicleBrand: '',
      vehiclePlate: '',
      trailerPlate: '',
      ...ownCarrier(company),
      driverName: '',
      driverDocument: '',
      driverAddress: '',
      startDate: today,
      endDate: today,
    },
    notes: '',
  };
}

const filled = (value: string, min = 2) => value.trim().length >= min;

function placeProblem(place: RemissionPlace, label: string): string | null {
  if (!filled(place.address, 3)) return `Cargá la dirección del punto de ${label}`;
  if (!filled(place.city)) return `Cargá la ciudad del punto de ${label}`;
  if (!filled(place.department)) return `Cargá el departamento del punto de ${label}`;
  return null;
}

/** Qué falta para emitir, según el art. 33 del Decreto 6539/05; null si está completo. */
export function remissionDraftProblem(draft: RemissionDraft, today: string): string | null {
  const t = draft.transport;
  return (
    placeProblem(draft.origin, 'partida') ??
    placeProblem(draft.destination, 'llegada') ??
    (!t.startDate || !t.endDate ? 'Cargá las fechas del traslado' : null) ??
    (t.startDate < today ? 'El traslado no puede empezar antes de hoy' : null) ??
    (t.endDate < t.startDate ? 'El traslado no puede terminar antes de empezar' : null) ??
    (!filled(t.vehicleBrand) ? 'Cargá la marca del vehículo' : null) ??
    (!filled(t.vehiclePlate, 3) ? 'Cargá la chapa o el RUA del vehículo' : null) ??
    (!filled(t.carrierName, 3) ? 'Cargá el nombre del transportista' : null) ??
    (!filled(t.carrierRuc, 3) ? 'Cargá el RUC del transportista' : null) ??
    (!filled(t.carrierAddress, 3) ? 'Cargá el domicilio fiscal del transportista' : null) ??
    (!filled(t.driverName, 3) ? 'Cargá el nombre del conductor' : null) ??
    (!filled(t.driverDocument, 3) ? 'Cargá la cédula del conductor' : null) ??
    (!filled(t.driverAddress, 3) ? 'Cargá la dirección del conductor' : null)
  );
}

const trimPlace = (place: RemissionPlace): RemissionPlace => ({
  address: place.address.trim(),
  city: place.city.trim(),
  department: place.department.trim(),
});

export function remissionPayloadBase(draft: RemissionDraft) {
  const t = draft.transport;
  const transport: RemissionTransportPayload = {
    type: t.type,
    vehicleBrand: t.vehicleBrand.trim(),
    vehiclePlate: t.vehiclePlate.trim(),
    ...(t.trailerPlate.trim() ? { trailerPlate: t.trailerPlate.trim() } : {}),
    carrierName: t.carrierName.trim(),
    carrierRuc: t.carrierRuc.trim(),
    carrierAddress: t.carrierAddress.trim(),
    driverName: t.driverName.trim(),
    driverDocument: t.driverDocument.trim(),
    driverAddress: t.driverAddress.trim(),
    startDate: t.startDate,
    endDate: t.endDate,
  };
  return {
    origin: trimPlace(draft.origin),
    destination: trimPlace(draft.destination),
    transport,
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
  };
}

export interface GoodsDraftLine {
  quantity: number;
  serialNumbers: string[];
}

const EMPTY_LINE: GoodsDraftLine = { quantity: 0, serialNumbers: [] };

/** Línea de un traslado o un envío: para un serializado, la cantidad son sus N/S. */
export function lineQuantity(line: GoodsDraftLine | undefined, isSerialized: boolean): number {
  const current = line ?? EMPTY_LINE;
  return isSerialized ? current.serialNumbers.length : current.quantity;
}

export function transferLinesProblem(
  stock: TransferStockRow[],
  lines: Record<string, GoodsDraftLine>,
): string | null {
  const chosen = stock.filter((row) => lineQuantity(lines[row.productId], row.isSerialized) > 0);
  if (chosen.length === 0) return 'Elegí qué mercadería se traslada';
  for (const row of chosen) {
    const quantity = lineQuantity(lines[row.productId], row.isSerialized);
    if (quantity > row.quantity) {
      return `De ${row.description} hay ${row.quantity} en el depósito de origen`;
    }
  }
  return null;
}

export function transferPayloadItems(
  stock: TransferStockRow[],
  lines: Record<string, GoodsDraftLine>,
) {
  return stock
    .filter((row) => lineQuantity(lines[row.productId], row.isSerialized) > 0)
    .map((row) => {
      const line = lines[row.productId] ?? EMPTY_LINE;
      return row.isSerialized
        ? { productId: row.productId, quantity: line.serialNumbers.length, serialNumbers: line.serialNumbers }
        : { productId: row.productId, quantity: line.quantity };
    });
}

export function saleLinesProblem(
  items: RemitableItem[],
  lines: Record<string, GoodsDraftLine>,
): string | null {
  const chosen = items.filter((item) => lineQuantity(lines[item.invoiceItemId], item.isSerialized) > 0);
  if (chosen.length === 0) return 'Elegí qué mercadería se envía';
  for (const item of chosen) {
    const quantity = lineQuantity(lines[item.invoiceItemId], item.isSerialized);
    if (quantity > item.remitable) {
      return `De ${item.description} quedan ${item.remitable} por enviar`;
    }
  }
  return null;
}

export function salePayloadItems(items: RemitableItem[], lines: Record<string, GoodsDraftLine>) {
  return items
    .filter((item) => lineQuantity(lines[item.invoiceItemId], item.isSerialized) > 0)
    .map((item) => {
      const line = lines[item.invoiceItemId] ?? EMPTY_LINE;
      return item.isSerialized
        ? { invoiceItemId: item.invoiceItemId, quantity: line.serialNumbers.length, serialNumbers: line.serialNumbers }
        : { invoiceItemId: item.invoiceItemId, quantity: line.quantity };
    });
}

/** La nota se emite cuando la mercadería todavía no salió: un traslado anulado devuelve el stock. */
export function canVoidRemission(note: Pick<RemissionNote, 'status'>): boolean {
  return note.status === 'ISSUED';
}

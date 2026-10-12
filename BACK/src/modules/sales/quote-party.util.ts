// A quién va dirigido un pedido. Un presupuesto puede hacerse para alguien
// que todavía no es cliente: sus datos se cargan a mano en el presupuesto y
// recién se registra como cliente si lo acepta.

export interface ProspectInput {
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

/** Los datos del prospecto tal como se guardan en el pedido. */
export interface ProspectFields {
  prospectName: string;
  prospectDocument: string | null;
  prospectPhone: string | null;
  prospectEmail: string | null;
  prospectAddress: string | null;
}

export type OrderParty =
  | { kind: 'customer'; customerId: string }
  | { kind: 'prospect'; fields: ProspectFields }
  | { kind: 'invalid'; reason: string };

const clean = (value?: string | null) => value?.trim() || null;

export function resolveOrderParty(input: {
  customerId?: string | null;
  prospect?: ProspectInput | null;
  isQuote: boolean;
}): OrderParty {
  const { customerId, prospect, isQuote } = input;
  if (customerId && prospect) {
    return {
      kind: 'invalid',
      reason:
        'Elegí un cliente registrado o cargá los datos a mano, no las dos cosas',
    };
  }
  if (customerId) return { kind: 'customer', customerId };
  if (!prospect) {
    return {
      kind: 'invalid',
      reason: isQuote
        ? 'Elegí un cliente o cargá los datos de la persona o empresa'
        : 'Elegí un cliente',
    };
  }
  // Un pedido real termina en factura y cuenta por cobrar: necesita un
  // cliente registrado.
  if (!isQuote) {
    return {
      kind: 'invalid',
      reason:
        'Solo un presupuesto puede hacerse para alguien que todavía no es cliente',
    };
  }
  const name = clean(prospect.name);
  if (!name) {
    return {
      kind: 'invalid',
      reason: 'Ingresá el nombre o la razón social',
    };
  }
  return {
    kind: 'prospect',
    fields: {
      prospectName: name,
      prospectDocument: clean(prospect.document),
      prospectPhone: clean(prospect.phone),
      prospectEmail: clean(prospect.email),
      prospectAddress: clean(prospect.address),
    },
  };
}

export const NO_PROSPECT: {
  [K in keyof ProspectFields]: null;
} = {
  prospectName: null,
  prospectDocument: null,
  prospectPhone: null,
  prospectEmail: null,
  prospectAddress: null,
};

// A nombre de quién sale el PDF de un presupuesto. Un presupuesto puede
// hacerse para alguien que todavía no es cliente: en ese caso sus datos están
// cargados a mano en el propio presupuesto.

interface QuoteCustomer {
  firstName: string;
  secondFirstName?: string | null;
  lastName: string;
  secondLastName?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  address?: string | null;
}

/**
 * A nombre de quién sale el presupuesto: los datos cargados a mano si los
 * hay, si no los del cliente registrado.
 */
export function quoteAddressee(order: {
  prospectName?: string | null;
  prospectDocument?: string | null;
  prospectAddress?: string | null;
  customer: QuoteCustomer;
}): { name: string; document: string; address: string } {
  if (order.prospectName) {
    return {
      name: order.prospectName,
      document: order.prospectDocument || '—',
      address: order.prospectAddress ?? '',
    };
  }
  const { customer } = order;
  return {
    name: [
      customer.firstName,
      customer.secondFirstName,
      customer.lastName,
      customer.secondLastName,
    ]
      .filter(Boolean)
      .join(' '),
    document: customer.documentNumber
      ? `${customer.documentType ?? 'CI'}: ${customer.documentNumber}`
      : '—',
    address: customer.address ?? '',
  };
}

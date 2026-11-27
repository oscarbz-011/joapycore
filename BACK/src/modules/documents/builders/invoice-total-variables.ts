import { money, type MoneyValue } from '../../../common/money/money';
import { numberToWordsEs } from '../../../common/utils/number-to-words.util';

/**
 * Total a pagar de la factura: lo que se cobró, con el efectivo redondeado
 * hacia abajo a 50. Como en el KuDE, el redondeo no se imprime: va solo en el
 * XML (dRedon).
 */
export function invoiceTotalVariables(
  total: MoneyValue,
  rounding: MoneyValue,
): Record<'factura.total' | 'factura.totalEnLetras', string> {
  const toPay = money(total).minus(money(rounding));
  return {
    'factura.total': toPay
      .toNumber()
      .toLocaleString('es-PY', { maximumFractionDigits: 0 }),
    'factura.totalEnLetras': numberToWordsEs(toPay.toNumber()),
  };
}

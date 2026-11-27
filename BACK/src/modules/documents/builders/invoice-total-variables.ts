import { money, type MoneyValue } from '../../../common/money/money';
import { numberToWordsEs } from '../../../common/utils/number-to-words.util';

const gs = (value: MoneyValue) =>
  money(value).toNumber().toLocaleString('es-PY', { maximumFractionDigits: 0 });

/**
 * Totales que imprime la factura: lo que se cobró, con el efectivo redondeado
 * hacia abajo a 50. La fila del redondeo viene completa o vacía porque la
 * plantilla no tiene condiciones.
 */
export function invoiceTotalVariables(
  total: MoneyValue,
  rounding: MoneyValue,
): Record<
  'factura.total' | 'factura.totalEnLetras' | 'factura.redondeo',
  string
> {
  const discount = money(rounding);
  const toPay = money(total).minus(discount);
  return {
    'factura.total': gs(toPay),
    'factura.totalEnLetras': numberToWordsEs(toPay.toNumber()),
    'factura.redondeo': discount.isZero()
      ? ''
      : `Redondeo (efectivo): -Gs. ${gs(discount)}`,
  };
}

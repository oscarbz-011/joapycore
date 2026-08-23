'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { posApi, type PosPaymentMethod, type PosTerminal } from '../../../../../lib/api/pos';
import { Card } from '@/components/ui/card';

const PAYMENT_METHOD_LABELS: Record<PosPaymentMethod, string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  PAGO_EXPRESS: 'Pago Express',
  AQUI_PAGO: 'Aquí Pago',
  CHECK: 'Cheque',
};

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PosHistoryPage() {
  const [terminalId, setTerminalId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: terminals = [] } = useQuery<PosTerminal[]>({
    queryKey: ['pos-terminals'],
    queryFn: posApi.listTerminals,
  });

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['pos-sales-history', terminalId, from, to],
    queryFn: () =>
      posApi.listSalesHistory({
        terminalId: terminalId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const total = sales.reduce(
    (sum, s) => sum + s.items.reduce((iSum, i) => iSum + i.quantity * i.unitPrice, 0),
    0,
  );

  const selectCls =
    'rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30';

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">Órdenes POS</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Histórico de ventas de mostrador — {sales.length} venta{sales.length !== 1 ? 's' : ''},{' '}
            {formatPrice(total)}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={terminalId} onChange={(e) => setTerminalId(e.target.value)} className={selectCls}>
          <option value="">Todas las cajas</option>
          {terminals.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={selectCls}
        />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls} />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando...</div>
      ) : sales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Receipt size={32} className="mb-3 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground/60">No hay ventas de POS en este período.</p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Ítems</th>
                  <th className="px-4 py-3 text-left">Pago</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sales.map((sale) => (
                  <tr key={sale.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(sale.orderDate)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {sale.customer.firstName} {sale.customer.lastName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sale.items.length} ítem{sale.items.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sale.salePayments.map((p) => PAYMENT_METHOD_LABELS[p.paymentMethod]).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
                      {formatPrice(sale.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

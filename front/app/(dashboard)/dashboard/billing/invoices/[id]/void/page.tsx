'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { billingApi } from '@/lib/api/billing';
import { canVoidInvoice } from '@/lib/credit-notes';
import { RequirePermission } from '@/components/require-permission';
import {
  EMPTY_SETTLEMENT,
  SettlementFields,
  type SettlementDraft,
  settlementProblem,
} from '@/components/billing/settlement-fields';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const money = (n: number) =>
  `Gs. ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n)}`;

export default function VoidInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [settlement, setSettlement] = useState<SettlementDraft>(EMPTY_SETTLEMENT);

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => billingApi.getInvoice(id),
  });

  const voidInvoice = useMutation({
    mutationFn: () =>
      billingApi.voidInvoice(id, {
        reason: reason.trim(),
        ...(invoice?.status === 'PAID' && settlement.mode
          ? {
              settlement: {
                mode: settlement.mode,
                ...(settlement.mode === 'REFUND' && settlement.method
                  ? { method: settlement.method, reference: settlement.reference.trim() || undefined }
                  : {}),
              },
            }
          : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
      ]);
      router.push(`/dashboard/billing/invoices/${id}`);
    },
  });

  if (isLoading) {
    return <div className="py-24 text-center text-sm text-muted-foreground/60">Cargando factura...</div>;
  }
  if (error || !invoice) {
    return (
      <p role="alert" className="py-24 text-center text-sm text-destructive">
        {apiErrorMessage(error, 'No se encontró la factura')}
      </p>
    );
  }

  const number = `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber ?? ''}`;
  const customer = invoice.saleOrder?.customer;
  const customerName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : null;
  const paid = invoice.status === 'PAID';
  const total = Number(invoice.total);
  const allowed = canVoidInvoice(invoice);
  const problem =
    reason.trim().length < 5
      ? 'Escribí el motivo de la anulación (al menos 5 letras)'
      : paid
        ? settlementProblem(settlement)
        : null;

  return (
    <div className="w-full space-y-6">
      <button
        type="button"
        onClick={() => router.push(`/dashboard/billing/invoices/${id}`)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Factura <span className="font-mono">{number}</span>
      </button>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">Anular factura</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono">{number}</span> · {customerName ?? 'Sin Nombre'} · {money(total)}
        </p>
      </div>

      {!allowed ? (
        <Card className="space-y-2 p-6">
          <p role="alert" className="text-sm text-foreground">
            Esta factura no se puede anular: ya tiene notas de crédito, no está emitida o es de intereses.
          </p>
          <Link href={`/dashboard/billing/invoices/${id}/credit-note`} className="text-sm font-medium text-primary underline">
            Emitir una nota de crédito
          </Link>
        </Card>
      ) : (
        <Card className="space-y-5 p-6">
          <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-subtle px-3 py-2 text-sm text-warn">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Anulá solo si la empresa conserva el original y todas las copias de la factura. Si el cliente ya se
              llevó el original, emití una{' '}
              <Link href={`/dashboard/billing/invoices/${id}/credit-note?kind=TOTAL`} className="font-medium underline">
                nota de crédito por el total
              </Link>
              . La mercadería vuelve al stock.
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="void-reason">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="void-reason"
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Se cargó al cliente equivocado, error en los ítems…"
            />
          </div>

          {paid && (
            <SettlementFields
              amount={total}
              customerName={invoice.anonymousBuyer ? null : customerName}
              value={settlement}
              onChange={setSettlement}
              disabled={voidInvoice.isPending}
            />
          )}

          {voidInvoice.isError && (
            <p role="alert" className="text-sm text-destructive">
              {apiErrorMessage(voidInvoice.error, 'No se pudo anular la factura')}
            </p>
          )}
          {problem && !voidInvoice.isError && <p className="text-xs text-muted-foreground">{problem}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push(`/dashboard/billing/invoices/${id}`)}>
              Volver
            </Button>
            <RequirePermission permission="billing:cancel">
              <Button
                variant="destructive"
                disabled={Boolean(problem) || voidInvoice.isPending}
                onClick={() => voidInvoice.mutate()}
              >
                {voidInvoice.isPending ? 'Anulando…' : 'Anular factura'}
              </Button>
            </RequirePermission>
          </div>
        </Card>
      )}
    </div>
  );
}

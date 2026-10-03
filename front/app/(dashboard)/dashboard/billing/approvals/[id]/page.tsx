'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, XCircle, Wrench, Clock, CreditCard, ShieldAlert } from 'lucide-react';
import { salesApi } from '../../../../../../lib/api/sales';
import {
  formatPrice,
  formatDate,
  orderBase,
  orderTotal,
  itemPrice,
  BureauCheckForm,
  IncomeCapacityBlock,
  RejectModal,
  AdjustmentModal,
} from '../../../../../../components/billing/credit-approval-shared';
import {
  CreditSummary,
  LoanHistoryTabs,
  UncollectibleControls,
} from '../../../../../../components/billing/credit-history-detail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const SECTION = 'rounded-2xl border border-border bg-card';
const SECTION_TITLE = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showReject, setShowReject] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['sale-order', id],
    queryFn: () => salesApi.getOrder(id),
  });
  const { data: evaluation, isLoading: loadingEvaluation, isError: evaluationFailed } = useQuery({
    queryKey: ['credit-evaluation', id],
    queryFn: () => salesApi.getCreditEvaluation(id),
  });

  const approveMutation = useMutation({
    mutationFn: () => salesApi.approveCredit(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      router.push('/dashboard/billing/approvals');
    },
  });

  // Abrir la evaluación le quita la marca de "Nuevo" en la bandeja, para
  // todos los analistas.
  const needsViewedMark = order?.status === 'PENDING_CREDIT_APPROVAL' && !order.creditViewedAt;
  useEffect(() => {
    if (!needsViewedMark) return;
    void salesApi
      .markCreditViewed(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['pending-approvals'] }))
      .catch(() => undefined);
  }, [needsViewedMark, id, queryClient]);

  function backToList() {
    void queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
    router.push('/dashboard/billing/approvals');
  }

  if (isLoading) {
    return <div className="py-24 text-center text-sm text-muted-foreground/60">Cargando pedido...</div>;
  }

  if (error || !order) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">No se encontró el pedido.</p>
        <Button variant="link" className="mt-2" onClick={() => router.push('/dashboard/billing/approvals')}>
          Volver
        </Button>
      </div>
    );
  }

  const seller = order.seller ?? order.createdBy;
  const total = orderTotal(order);
  const subtotal = orderBase(order);
  const canDecide = order.status === 'PENDING_CREDIT_APPROVAL';
  const history = evaluation?.history;
  const hasLoans = !!history && history.activeLoans.length + history.finishedLoans.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => router.push('/dashboard/billing/approvals')}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} />
        Aprobaciones de crédito
      </button>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {order.customer.firstName} {order.customer.lastName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {order.customer.email && <span>{order.customer.email}</span>}
            {order.customer.documentNumber && (
              <span>{order.customer.documentType ?? 'CI'}: {order.customer.documentNumber}</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock size={12} />{formatDate(order.orderDate)}</span>
            <span className="flex items-center gap-1"><CreditCard size={12} />Crédito</span>
            {seller && <span>Vendedor: {seller.firstName} {seller.lastName}</span>}
          </div>
        </div>
        {!canDecide && <Badge variant="outline">{order.status}</Badge>}
      </div>

      {/* Dos columnas: a la derecha el resumen y las acciones quedan fijos al
          hacer scroll, para decidir sin recorrer todo el historial. En
          pantallas chicas el resumen va primero. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <aside className="order-first space-y-4 lg:order-last lg:sticky lg:top-4">
          {/* El contenido scrollea por dentro si no entra en la pantalla; las
              acciones quedan siempre visibles al pie del panel. */}
          <div className={`${SECTION} flex flex-col lg:max-h-[calc(100dvh-7rem)]`}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <p className={SECTION_TITLE}>Evaluación</p>

            {loadingEvaluation ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted/30" />
            ) : evaluationFailed || !evaluation ? (
              <p role="alert" className="text-sm text-destructive">
                No se pudo cargar la evaluación de crédito. Recargá la página.
              </p>
            ) : (
              <>
                <CreditSummary history={evaluation.history} />

                <div className="rounded-xl border border-border px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Esta solicitud
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{formatPrice(total)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {order.installments
                      ? `${order.installments} cuotas de ≈ ${formatPrice(evaluation.proposedMonthlyPayment)}`
                      : 'Sin cuotas'}
                  </p>
                </div>

                <IncomeCapacityBlock capacity={evaluation.capacity} />

                {evaluation.bureau.latestResult === 'FLAGGED' && (
                  <p className="flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <ShieldAlert size={13} />
                    Cliente reportado en el buró de crédito
                  </p>
                )}
                {evaluation.bureau.required && <BureauCheckForm order={order} />}

                <UncollectibleControls
                  customerId={order.customer.id}
                  history={evaluation.history}
                  onChanged={() => void queryClient.invalidateQueries({ queryKey: ['credit-evaluation', id] })}
                />
              </>
            )}

            </div>

            {canDecide && (
              <div className="space-y-2 border-t border-border p-4">
                <Button
                  className="w-full"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle />
                  {approveMutation.isPending ? 'Aprobando...' : 'Aprobar crédito'}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setShowAdjustment(true)}>
                    <Wrench />
                    Necesita ajustes
                  </Button>
                  <Button variant="destructive" onClick={() => setShowReject(true)}>
                    <XCircle />
                    Rechazar
                  </Button>
                </div>
                {approveMutation.isError && (
                  <p role="alert" className="text-xs text-destructive">
                    {apiErrorMessage(approveMutation.error, 'Error al aprobar')}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          {/* Historial */}
          <section className={SECTION}>
            <div className="border-b border-border px-5 py-3">
              <p className={SECTION_TITLE}>Historial de créditos</p>
            </div>
            <div className="px-5 py-4">
              {loadingEvaluation ? (
                <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
              ) : hasLoans && history ? (
                <LoanHistoryTabs history={history} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {evaluationFailed
                    ? 'No se pudo cargar el historial.'
                    : 'El cliente no tiene créditos anteriores.'}
                </p>
              )}
            </div>
          </section>

          {/* Items */}
          <section className={SECTION}>
            <div className="border-b border-border px-5 py-3">
              <p className={SECTION_TITLE}>Productos de esta solicitud</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{item.product?.name ?? item.description ?? 'Ítem'}</p>
                    {item.product?.model && <p className="text-xs text-muted-foreground">{item.product.model}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-muted-foreground">{item.quantity} × {formatPrice(itemPrice(item))}</p>
                    <p className="text-sm font-medium text-foreground">{formatPrice(item.quantity * itemPrice(item))}</p>
                  </div>
                </div>
              ))}

              {order.surchargeAmount != null && order.surchargeType && (
                <div className="flex justify-between text-xs text-warn pt-2 border-t border-border">
                  <span>Recargo{order.surchargeReason ? ` — ${order.surchargeReason}` : ''}{order.surchargeType === 'PERCENTAGE' ? ` (${order.surchargeAmount}%)` : ''}</span>
                  <span className="font-mono tabular-nums">+{formatPrice(total - subtotal)}</span>
                </div>
              )}

              <div className="flex justify-between items-center border-t border-border pt-3">
                <span className="text-sm font-semibold text-muted-foreground">Total</span>
                <span className="text-lg font-bold text-foreground">{formatPrice(total)}</span>
              </div>
            </div>
          </section>

          {order.notes && (
            <section className={`${SECTION} px-5 py-4`}>
              <p className={`mb-1 ${SECTION_TITLE}`}>Notas del pedido</p>
              <p className="text-sm text-muted-foreground">{order.notes}</p>
            </section>
          )}

          {order.guarantors.length > 0 && (
            <section className={SECTION}>
              <div className="border-b border-border px-5 py-3">
                <p className={SECTION_TITLE}>Garantes</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                {order.guarantors.map((g) => (
                  <div key={g.id} className="text-sm">
                    <p className="text-foreground">{g.firstName} {g.lastName}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.documentType}: {g.documentNumber}
                      {g.phone ? ` · ${g.phone}` : ''}
                      {g.monthlyIncome != null ? ` · Ingreso: ${formatPrice(g.monthlyIncome)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <RejectModal order={order} open={showReject} onOpenChange={setShowReject} onSuccess={backToList} />
      <AdjustmentModal order={order} open={showAdjustment} onOpenChange={setShowAdjustment} onSuccess={backToList} />
    </div>
  );
}

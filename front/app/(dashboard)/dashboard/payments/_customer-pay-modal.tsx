"use client";
import { sumMoney } from "@/lib/money";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiErrorMessage } from "@/lib/api/api-error";
import { financeApi } from "@/lib/api/finance";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/api/payments";
import { loanInvoiceRef, loanTitle, type SelectedInstallment } from "@/lib/customer-collect";
import { todayISODate } from "@/lib/date";
import { openPdf } from "@/lib/open-pdf";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "./_shared";

/** Cobro de cuotas de uno o varios productos del cliente. */
export function PayCustomerInstallmentsModal({
  customerId,
  groups,
  open,
  onOpenChange,
  onSaved,
}: {
  customerId: string;
  /** Lo elegido, agrupado por producto. */
  groups: SelectedInstallment[][];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const items = groups.flat();
  const total = sumMoney(items.map((item) => item.amount)).toNumber();
  const severalProducts = groups.length > 1;

  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [date, setDate] = useState(todayISODate());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [separateReceipts, setSeparateReceipts] = useState(false);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      financeApi.payCustomerInstallments(customerId, {
        items: items.map((item) => ({ installmentId: item.inst.id, amount: item.amount })),
        paymentMethod: method,
        paymentReference: reference.trim() || undefined,
        paymentDate: date,
        notes: notes.trim() || undefined,
        separateReceipts: severalProducts && separateReceipts,
      }),
    onSuccess: ({ receipts }) => {
      for (const receipt of receipts) {
        if (receipt.pdfFileId) void openPdf(receipt.pdfFileId);
      }
      setSeparateReceipts(false);
      onSaved();
    },
    onError: (err: Error) => setError(apiErrorMessage(err, "No se pudo registrar el cobro.")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div>
            <DialogTitle className="text-base font-semibold">
              Cobrar {items.length} {items.length === 1 ? "cuota" : "cuotas"}
              {severalProducts && ` de ${groups.length} productos`}
            </DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Total: {formatPrice(total)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Cerrar"
            onClick={() => onOpenChange(false)}
          >
            <X size={18} />
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            mutation.mutate();
          }}
          className="max-h-[75vh] space-y-4 overflow-y-auto px-6 py-5"
        >
          <div className="space-y-3 rounded-lg bg-muted/30 px-3 py-2">
            {groups.map((group) => {
              const loan = group[0].loan;
              const invoice = loanInvoiceRef(loan);
              return (
                <div key={loan.id} className="space-y-1">
                  {severalProducts && (
                    <p className="text-xs font-medium text-foreground">
                      {loanTitle(loan)}
                      {invoice && <span className="font-normal text-muted-foreground"> · Factura {invoice}</span>}
                    </p>
                  )}
                  {group.map((item) => (
                    <div key={item.inst.id} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Cuota #{item.inst.number}
                        {!item.isFull && " (parcial)"}
                      </span>
                      <span className="font-medium tabular-nums text-foreground">{formatPrice(item.amount)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {severalProducts && (
            <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2">
              <Checkbox
                id="separate-receipts"
                checked={separateReceipts}
                onCheckedChange={(checked) => setSeparateReceipts(checked === true)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="separate-receipts" className="text-sm">
                  Separar recibos por producto
                </Label>
                <p className="text-xs text-muted-foreground">
                  {separateReceipts
                    ? `Salen ${groups.length} recibos, uno por producto.`
                    : "Sale un solo recibo con el detalle de todos los productos."}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Fecha *</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="space-y-1.5">
            <Label>Método de pago *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full">
                <span className="flex-1 truncate text-left text-sm">{PAYMENT_METHOD_LABELS[method]}</span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {PAYMENT_METHOD_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-reference">Referencia / Comprobante</Label>
            <Input
              id="pay-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="N° de transferencia, depósito…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notas</Label>
            <Textarea id="pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-border pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || items.length === 0}>
              {mutation.isPending ? "Registrando…" : "Confirmar cobro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

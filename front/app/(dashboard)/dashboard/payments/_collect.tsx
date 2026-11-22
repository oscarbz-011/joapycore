"use client";

import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Installment } from "@/lib/api/finance";
import { formatDatePY } from "@/lib/date";
import { chargesTotalOf, outstandingOf } from "@/lib/finance-distribute";
import { isPayable, type Selection } from "@/lib/receivable-collect";
import { cn } from "@/lib/utils";
import { ReceiptButton } from "@/components/receipt-button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPrice, InstallmentStatusBadge, installmentUrgency } from "./_shared";

export const PANEL = "rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5";

export function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "good";
}) {
  return (
    <div className={PANEL}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "good" && "text-emerald-600",
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function InstallmentsTable({
  installments,
  selection,
  onToggle,
  productLabel,
}: {
  installments: Installment[];
  selection: Selection;
  onToggle: (inst: Installment) => void;
  /** Para el nombre accesible de cada casilla cuando hay varios productos. */
  productLabel?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleCharges = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">Cobrar</span>
          </TableHead>
          <TableHead>N.º</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Cuota</TableHead>
          <TableHead className="text-right">Pagado</TableHead>
          <TableHead className="text-right">Recargos</TableHead>
          <TableHead className="text-right">A pagar</TableHead>
          <TableHead className="text-right">A cobrar ahora</TableHead>
          <TableHead>Recibo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {installments.map((inst) => {
          const charges = inst.interestCharges ?? [];
          const chargesTotal = chargesTotalOf(inst);
          const payable = isPayable(inst);
          const chosen = selection[inst.id];
          const showCharges = open.has(inst.id);
          return (
            <Fragment key={inst.id}>
              <TableRow data-state={chosen != null ? "selected" : undefined}>
                <TableCell>
                  {payable && (
                    <Checkbox
                      checked={chosen != null}
                      onCheckedChange={() => onToggle(inst)}
                      aria-label={
                        productLabel
                          ? `Cobrar la cuota ${inst.number} de ${productLabel}`
                          : `Cobrar la cuota ${inst.number}`
                      }
                    />
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{inst.number}</TableCell>
                <TableCell className="tabular-nums">{formatDatePY(inst.dueDate, "utc")}</TableCell>
                <TableCell>
                  <InstallmentStatusBadge status={inst.status} urgency={installmentUrgency(inst)} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatPrice(Number(inst.amount))}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {Number(inst.paidAmount) > 0 ? formatPrice(Number(inst.paidAmount)) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {chargesTotal > 0 ? (
                    <button
                      type="button"
                      aria-expanded={showCharges}
                      onClick={() => toggleCharges(inst.id)}
                      className="inline-flex items-center gap-1 text-destructive underline-offset-4 hover:underline"
                    >
                      {formatPrice(chargesTotal)}
                      <ChevronDown
                        size={13}
                        aria-hidden
                        className={cn("transition-transform", showCharges && "rotate-180")}
                      />
                    </button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {payable ? formatPrice(outstandingOf(inst)) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {chosen == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="font-medium">
                      {formatPrice(chosen)}
                      {chosen < outstandingOf(inst) && (
                        <span className="ml-1 font-normal text-muted-foreground">(parcial)</span>
                      )}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {Number(inst.paidAmount) > 0 && <ReceiptButton installmentId={inst.id} />}
                </TableCell>
              </TableRow>
              {showCharges && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={10}>
                    <ul className="ml-10 space-y-0.5 text-xs text-muted-foreground">
                      {charges.map((charge) => (
                        <li key={charge.id} className="flex max-w-sm justify-between gap-4">
                          <span>{charge.component.name}</span>
                          <span className="tabular-nums">{formatPrice(Number(charge.amount))}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

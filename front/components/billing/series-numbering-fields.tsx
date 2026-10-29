'use client';

import Link from 'next/link';
import type { BillingSeriesOption } from '@/lib/api/billing';
import {
  MODALITY_LABELS,
  needsDocumentNumber,
  seriesLabel,
  usableOptions,
} from '@/lib/billing-series';
import { formatDatePY } from '@/lib/date';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

/**
 * Serie con la que se numera una factura y, si es un talonario de imprenta,
 * el número de la hoja. Con una sola serie vigente no hay nada que elegir.
 */
export function SeriesNumberingFields({
  options,
  isLoading,
  seriesId,
  onSeriesChange,
  documentNumber,
  onDocumentNumberChange,
  documentNumberError,
  disabled,
}: {
  options: BillingSeriesOption[];
  isLoading: boolean;
  seriesId: string;
  onSeriesChange: (id: string) => void;
  documentNumber: string;
  onDocumentNumberChange: (value: string) => void;
  documentNumberError?: string | null;
  disabled?: boolean;
}) {
  const usable = usableOptions(options);
  const selected = usable.find((o) => o.id === seriesId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Buscando la serie de facturación…</p>;
  }

  if (usable.length === 0) {
    const reason = options.length === 1 ? options[0].problem : null;
    return (
      <div role="alert" className="rounded-lg border border-warn/30 bg-warn-subtle px-4 py-3 text-sm text-warn">
        {reason ?? 'La sucursal no tiene una serie de facturas vigente.'}{' '}
        <Link href="/dashboard/settings/billing-series" className="font-medium underline">
          Ir a series y timbrados
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="issue-series">Serie</Label>
        {usable.length === 1 ? (
          <p id="issue-series" className="text-sm text-foreground">{seriesLabel(usable[0])}</p>
        ) : (
          <Select value={seriesId || 'none'} onValueChange={(v) => onSeriesChange(v && v !== 'none' ? v : '')} disabled={disabled}>
            <SelectTrigger id="issue-series" className="w-full">
              <span className="flex-1 truncate text-left text-sm">
                {selected ? seriesLabel(selected) : '— Elegí la serie —'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {usable.map((o) => (
                <SelectItem key={o.id} value={o.id}>{seriesLabel(o)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selected && (
          <p className="text-xs text-muted-foreground">
            {MODALITY_LABELS[selected.modality]} · vigente hasta el {formatDatePY(selected.validUntil)}
          </p>
        )}
      </div>

      {needsDocumentNumber(selected) && selected && (
        <div className="space-y-1.5">
          <Label htmlFor="issue-document-number">
            Número del talonario <span className="text-destructive">*</span>
          </Label>
          <Input
            id="issue-document-number"
            inputMode="numeric"
            value={documentNumber}
            onChange={(e) => onDocumentNumberChange(e.target.value.replace(/\D/g, ''))}
            placeholder={String(selected.nextNumber)}
            disabled={disabled}
            aria-invalid={Boolean(documentNumberError)}
            aria-describedby="issue-document-number-help"
          />
          <p id="issue-document-number-help" className="text-xs text-muted-foreground">
            Rango del talonario: {selected.rangeFrom} a {selected.rangeTo}. Siguiente esperado: {selected.nextNumber}.
          </p>
          {documentNumberError && <p className="text-xs text-destructive">{documentNumberError}</p>}
        </div>
      )}
    </div>
  );
}

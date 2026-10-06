'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TierRow } from '@/lib/commercial-terms';

/**
 * Editor de tramos "desde X → valor": descuentos por total de la orden o
 * precios por cantidad. Las filas vacías se ignoran al guardar.
 */
export function TierRows({
  rows,
  onChange,
  fromLabel,
  valueLabel,
  addLabel,
  emptyText,
  disabled,
}: {
  rows: TierRow[];
  onChange: (rows: TierRow[]) => void;
  fromLabel: string;
  valueLabel: string;
  addLabel: string;
  emptyText: string;
  disabled?: boolean;
}) {
  const patch = (index: number, change: Partial<TierRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-xs font-medium text-muted-foreground">
            <span>{fromLabel}</span>
            <span>{valueLabel}</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2">
              <Input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                aria-label={`${fromLabel}, tramo ${index + 1}`}
                value={row.from}
                disabled={disabled}
                onChange={(e) => patch(index, { from: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                aria-label={`${valueLabel}, tramo ${index + 1}`}
                value={row.value}
                disabled={disabled}
                onChange={(e) => patch(index, { value: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Quitar tramo ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...rows, { from: '', value: '' }])}
      >
        <Plus size={14} />
        {addLabel}
      </Button>
    </div>
  );
}

'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';

function DateField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1">
        <DatePicker
          id={id}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder="Sin fecha"
        />
        {value && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Quitar ${label.toLowerCase()}`}
            title="Quitar fecha"
            onClick={() => onChange('')}
          >
            <X size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Desde / hasta de la vigencia de un precio, en AAAA-MM-DD ('' = sin límite). */
export function ValidityFields({
  idPrefix,
  from,
  to,
  onFromChange,
  onToChange,
  disabled,
}: {
  idPrefix: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DateField
        id={`${idPrefix}-valid-from`}
        label="Válido desde"
        value={from}
        onChange={onFromChange}
        disabled={disabled}
      />
      <DateField
        id={`${idPrefix}-valid-to`}
        label="Válido hasta"
        value={to}
        onChange={onToChange}
        disabled={disabled}
      />
    </div>
  );
}

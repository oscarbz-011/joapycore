'use client';

import { useEffect, useRef, useState } from 'react';

function toDisplay(n: number, decimals: number): string {
  if (n === 0) return '';
  return new Intl.NumberFormat('es-PY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(n);
}

function toRaw(n: number, decimals: number): string {
  if (n === 0) return '';
  // Always show with period as decimal (standard JS) while user is typing
  return decimals > 0 ? n.toString() : String(Math.round(n));
}

function parse(raw: string): number {
  // Accept both '.' and ',' as decimal separator while typing
  // Strip any period that looks like a thousands separator (multiple occurrences, or followed by 3+ digits at end)
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  // If the string has a comma: replace comma → period (Latin decimal separator)
  // and strip any remaining periods (they were thousands separators)
  if (trimmed.includes(',')) {
    const normalized = trimmed.replace(/\./g, '').replace(',', '.');
    return parseFloat(normalized) || 0;
  }

  // No comma: treat period as decimal (standard typing behavior while raw)
  return parseFloat(trimmed) || 0;
}

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (value: number) => void;
  /** Decimal places to display when formatted. 0 = integer (default). */
  decimals?: number;
}

/**
 * Drop-in replacement for <input type="number"> that formats with thousands
 * separator (es-PY locale: 850.000) on blur and shows raw digits while typing.
 */
export function NumericInput({
  value,
  onChange,
  decimals = 0,
  onFocus,
  onBlur,
  ...props
}: NumericInputProps) {
  const isFocused = useRef(false);
  const [display, setDisplay] = useState(() => toDisplay(value, decimals));

  // Keep display in sync when value is changed externally (e.g. auto-compute)
  useEffect(() => {
    if (!isFocused.current) {
      setDisplay(toDisplay(value, decimals));
    }
  }, [value, decimals]);

  return (
    <input
      {...props}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      value={display}
      onChange={(e) => {
        const raw = e.target.value;
        // Allow digits, one period, one comma. Strip everything else.
        const filtered = raw.replace(/[^\d.,]/g, '');
        setDisplay(filtered);
        onChange(parse(filtered));
      }}
      onFocus={(e) => {
        isFocused.current = true;
        setDisplay(toRaw(value, decimals));
        onFocus?.(e);
      }}
      onBlur={(e) => {
        isFocused.current = false;
        setDisplay(toDisplay(value, decimals));
        onBlur?.(e);
      }}
    />
  );
}

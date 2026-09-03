'use client';

import { useState } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDatePY, parseISODate, toISODate, todayISODate } from '@/lib/date';

const WEEKDAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Grid de 6 filas x 7 columnas (42 celdas) arrancando en el domingo de la
// semana que contiene el día 1 — incluye días del mes anterior/siguiente
// para completar filas, igual que cualquier calendario nativo. Todo en UTC
// (ver front/lib/date.ts) para no correr el día según el timezone del navegador.
function buildGrid(viewYear: number, viewMonth: number): Date[] {
  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const gridStart = new Date(Date.UTC(viewYear, viewMonth, 1 - startWeekday));
  return Array.from({ length: 42 }, (_, i) =>
    new Date(Date.UTC(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + i)),
  );
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  disabled,
  id,
  className,
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const selected = parseISODate(value);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selected ?? parseISODate(todayISODate())!);

  const viewYear = viewDate.getUTCFullYear();
  const viewMonth = viewDate.getUTCMonth();
  const grid = buildGrid(viewYear, viewMonth);
  const todayISO = todayISODate();

  function openChange(next: boolean) {
    setOpen(next);
    // Al reabrir, el mes visible vuelve a partir del valor seleccionado (o de
    // hoy si no hay ninguno) — no queda "perdido" en el mes al que navegó la
    // última vez que se abrió sin elegir nada.
    if (next) setViewDate(selected ?? parseISODate(todayISODate())!);
  }

  function selectDay(d: Date) {
    onChange(toISODate(d));
    setOpen(false);
  }

  function changeMonth(delta: number) {
    setViewDate(new Date(Date.UTC(viewYear, viewMonth + delta, 1)));
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={openChange}>
      <PopoverPrimitive.Trigger
        id={id}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 text-sm transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <CalendarIcon size={14} className="shrink-0 text-muted-foreground" />
        <span className={cn('min-w-0 flex-1 truncate text-left', !selected && 'text-muted-foreground')}>
          {selected ? formatDatePY(value, 'utc') : placeholder}
        </span>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner sideOffset={4} align="start" className="isolate z-50">
          <PopoverPrimitive.Popup className="w-64 rounded-3xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none dark:ring-foreground/10">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[13px] font-medium capitalize">{MONTH_NAMES[viewMonth]} {viewYear}</span>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1 text-center text-[10px] font-medium text-muted-foreground/60">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((d) => {
                const iso = toISODate(d);
                const inMonth = d.getUTCMonth() === viewMonth;
                const isSelected = value === iso;
                const isToday = iso === todayISO;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => selectDay(d)}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full text-xs transition-colors',
                      !inMonth && 'text-muted-foreground/30 hover:bg-muted/20',
                      inMonth && !isSelected && 'text-foreground hover:bg-muted/40',
                      isSelected && 'bg-primary font-semibold text-primary-foreground',
                      isToday && !isSelected && 'ring-1 ring-inset ring-primary/50',
                    )}
                  >
                    {d.getUTCDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={() => selectDay(parseISODate(todayISODate())!)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Hoy
              </button>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

'use client';

import { useRef, useState } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseISODate, toISODate, todayISODate } from '@/lib/date';
import {
  YEARS_PER_PAGE,
  formatDateInput,
  maskDateInput,
  parseDateInput,
  yearPageStart,
} from '@/lib/date-input';

const WEEKDAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const FULL_DATE_LENGTH = 'dd/mm/aaaa'.length;

type View = 'days' | 'months' | 'years';

// Todo en UTC (ver front/lib/date.ts) para no correr el día según el timezone del navegador.
function buildGrid(viewYear: number, viewMonth: number): Date[] {
  const startWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(viewYear, viewMonth, 1 - startWeekday + i)));
}

const navButton =
  'rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground';
const cellButton = 'flex items-center justify-center rounded-full text-xs transition-colors';

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
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('days');
  const [viewDate, setViewDate] = useState(() => selected ?? parseISODate(todayISODate())!);
  const [text, setText] = useState(() => formatDateInput(value));
  const [shownValue, setShownValue] = useState(value);

  if (value !== shownValue) {
    setShownValue(value);
    setText(formatDateInput(value));
  }

  const viewYear = viewDate.getUTCFullYear();
  const viewMonth = viewDate.getUTCMonth();
  const todayISO = todayISODate();

  function openChange(next: boolean) {
    setOpen(next);
    if (next) {
      setView('days');
      setViewDate(parseISODate(parseDateInput(text)) ?? selected ?? parseISODate(todayISO)!);
    }
  }

  function commit(iso: string) {
    setText(formatDateInput(iso));
    if (iso !== (value ?? '')) onChange(iso);
  }

  function selectDay(d: Date) {
    commit(toISODate(d));
    setOpen(false);
  }

  function handleType(raw: string) {
    const masked = maskDateInput(raw);
    setText(masked);
    if (!masked) {
      if (value) onChange('');
      return;
    }
    // Con el año a medio tipear, "14/11/20" no se toma como 2020.
    const iso = masked.length === FULL_DATE_LENGTH ? parseDateInput(masked) : null;
    if (iso && iso !== value) onChange(iso);
  }

  // Al salir del campo, un texto incompleto o inválido vuelve a la fecha anterior.
  function settleText() {
    const iso = parseDateInput(text);
    if (iso) commit(iso);
    else setText(formatDateInput(value));
  }

  function moveView(delta: number) {
    if (view === 'days') setViewDate(new Date(Date.UTC(viewYear, viewMonth + delta, 1)));
    if (view === 'months') setViewDate(new Date(Date.UTC(viewYear + delta, viewMonth, 1)));
    if (view === 'years') setViewDate(new Date(Date.UTC(viewYear + delta * YEARS_PER_PAGE, viewMonth, 1)));
  }

  const firstYear = yearPageStart(viewYear);
  const title =
    view === 'days'
      ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
      : view === 'months'
        ? String(viewYear)
        : `${firstYear} – ${firstYear + YEARS_PER_PAGE - 1}`;
  const previousLabel = { days: 'Mes anterior', months: 'Año anterior', years: 'Años anteriores' }[view];
  const nextLabel = { days: 'Mes siguiente', months: 'Año siguiente', years: 'Años siguientes' }[view];
  const selectedYear = selected?.getUTCFullYear();
  const selectedMonth = selected?.getUTCMonth();
  const currentYear = Number(todayISO.slice(0, 4));
  const currentMonth = Number(todayISO.slice(5, 7)) - 1;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={openChange}>
      <div
        ref={fieldRef}
        className={cn(
          'flex h-9 w-full items-center gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 text-sm transition-[color,box-shadow,background-color] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        <PopoverPrimitive.Trigger
          disabled={disabled}
          aria-label="Abrir calendario"
          className="-ml-1 shrink-0 rounded-full p-1 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground disabled:cursor-not-allowed"
        >
          <CalendarIcon size={14} />
        </PopoverPrimitive.Trigger>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={FULL_DATE_LENGTH}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          onChange={(e) => handleType(e.target.value)}
          onBlur={settleText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              settleText();
            } else if (e.key === 'ArrowDown' && !disabled) {
              e.preventDefault();
              openChange(true);
            }
          }}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner anchor={fieldRef} sideOffset={4} align="start" className="isolate z-50">
          <PopoverPrimitive.Popup
            finalFocus={inputRef}
            className="w-64 rounded-3xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none dark:ring-foreground/10"
          >
            <div className="mb-2 flex items-center justify-between">
              <button type="button" aria-label={previousLabel} onClick={() => moveView(-1)} className={navButton}>
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                disabled={view === 'years'}
                aria-label={view === 'days' ? 'Elegir mes y año' : view === 'months' ? 'Elegir año' : undefined}
                onClick={() => setView(view === 'days' ? 'months' : 'years')}
                className="rounded-lg px-2 py-0.5 text-[13px] font-medium capitalize transition-colors enabled:hover:bg-muted/40"
              >
                {title}
              </button>
              <button type="button" aria-label={nextLabel} onClick={() => moveView(1)} className={navButton}>
                <ChevronRight size={14} />
              </button>
            </div>

            {view === 'days' && (
              <>
                <div className="grid grid-cols-7 gap-0.5">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className="py-1 text-center text-[10px] font-medium text-muted-foreground/60">
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {buildGrid(viewYear, viewMonth).map((d) => {
                    const iso = toISODate(d);
                    const inMonth = d.getUTCMonth() === viewMonth;
                    const isSelected = value === iso;
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => selectDay(d)}
                        className={cn(
                          cellButton,
                          'size-8',
                          !inMonth && 'text-muted-foreground/30 hover:bg-muted/20',
                          inMonth && !isSelected && 'text-foreground hover:bg-muted/40',
                          isSelected && 'bg-primary font-semibold text-primary-foreground',
                          iso === todayISO && !isSelected && 'ring-1 ring-inset ring-primary/50',
                        )}
                      >
                        {d.getUTCDate()}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {view === 'months' && (
              <div className="grid grid-cols-3 gap-1">
                {MONTH_NAMES.map((name, month) => {
                  const isSelected = selectedYear === viewYear && selectedMonth === month;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setViewDate(new Date(Date.UTC(viewYear, month, 1)));
                        setView('days');
                      }}
                      className={cn(
                        cellButton,
                        'h-10 capitalize',
                        isSelected ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted/40',
                        !isSelected && viewYear === currentYear && month === currentMonth && 'ring-1 ring-inset ring-primary/50',
                      )}
                    >
                      {name.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            )}

            {view === 'years' && (
              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: YEARS_PER_PAGE }, (_, i) => firstYear + i).map((year) => {
                  const isSelected = selectedYear === year;
                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => {
                        setViewDate(new Date(Date.UTC(year, viewMonth, 1)));
                        setView('months');
                      }}
                      className={cn(
                        cellButton,
                        'h-10',
                        isSelected ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted/40',
                        !isSelected && year === currentYear && 'ring-1 ring-inset ring-primary/50',
                      )}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <button
                type="button"
                onClick={() => {
                  commit('');
                  setOpen(false);
                }}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={() => selectDay(parseISODate(todayISO)!)}
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

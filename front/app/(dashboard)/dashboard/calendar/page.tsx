"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { usePermission } from "@/lib/permissions";
import { useActiveModules } from "@/lib/use-active-modules";
import { apiErrorMessage } from "@/lib/api/api-error";
import { calendarApi } from "@/lib/api/calendar";
import { paymentsApi } from "@/lib/api/payments";
import { procurementApi } from "@/lib/api/procurement";
import {
  CALENDAR_PATH,
  KINDS,
  WEEKDAYS,
  dayTitle,
  eventItems,
  installmentItems,
  isInMonth,
  itemsByDay,
  monthGrid,
  monthKey,
  monthLabel,
  parseMonth,
  purchaseItems,
  shiftMonth,
  type CalendarItem,
  type ItemKind,
} from "@/lib/calendar";
import { localISODate } from "@/lib/date";

const MAX_IN_CELL = 3;

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <Calendar />
    </Suspense>
  );
}

function Calendar() {
  const router = useRouter();
  const params = useSearchParams();
  const { jwtPayload } = useAuth();
  const { hasModule } = useActiveModules();
  const canSeeCollections = usePermission("payments:read") && hasModule("payments");
  const canSeePurchases = usePermission("procurement:read") && hasModule("procurement");
  const [hidden, setHidden] = useState<ReadonlySet<ItemKind>>(new Set());

  const today = localISODate(new Date());
  const month = parseMonth(params.get("m"), today);
  const selected = params.get("d") ?? (isInMonth(today, month) ? today : `${monthKey(month)}-01`);
  const grid = monthGrid(month);
  const go = (nextMonth: typeof month, day?: string) => {
    const query = new URLSearchParams({ m: monthKey(nextMonth) });
    if (day) query.set("d", day);
    router.replace(`${CALENDAR_PATH}?${query.toString()}`, { scroll: false });
  };

  const events = useQuery({
    queryKey: ["calendar", jwtPayload?.tenantId, jwtPayload?.sub, "events", grid[0], grid[41]],
    queryFn: () => calendarApi.events(grid[0], grid[41]),
  });
  const receivables = useQuery({
    queryKey: ["accounts-receivable"],
    queryFn: paymentsApi.listAR,
    enabled: canSeeCollections,
  });
  const purchases = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: procurementApi.listOrders,
    enabled: canSeePurchases,
  });

  const kinds: ItemKind[] = [
    "event",
    "company",
    ...(canSeeCollections ? (["installment"] as const) : []),
    ...(canSeePurchases ? (["purchase"] as const) : []),
  ];
  const byDay = itemsByDay(
    [
      ...eventItems(events.data ?? [], jwtPayload?.sub),
      ...installmentItems(receivables.data ?? []),
      ...purchaseItems(purchases.data ?? []),
    ],
    hidden,
  );
  const toggle = (kind: ItemKind) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendario</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus eventos, los de la empresa y las fechas que vienen del sistema.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${CALENDAR_PATH}/new?date=${selected}`} className={cn(buttonVariants())}>
            <Plus size={15} /> Nuevo evento
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Mes anterior"
            onClick={() => go(shiftMonth(month, -1))}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Mes siguiente"
            onClick={() => go(shiftMonth(month, 1))}
          >
            <ChevronRight size={16} />
          </Button>
          <h2 className="ml-1 text-lg font-semibold first-letter:uppercase">{monthLabel(month)}</h2>
          <Button variant="ghost" size="sm" onClick={() => go(parseMonth(null, today), today)}>
            Hoy
          </Button>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Qué mostrar">
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={!hidden.has(kind)}
              onClick={() => toggle(kind)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                hidden.has(kind)
                  ? "border-border text-muted-foreground line-through"
                  : "border-border bg-muted/50",
              )}
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: KINDS[kind].color }} />
              {KINDS[kind].label}
            </button>
          ))}
        </div>
      </div>

      {events.error && (
        <div className="space-y-3">
          <p
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {apiErrorMessage(events.error, "No se pudieron cargar los eventos.")}
          </p>
          <Button variant="outline" size="sm" onClick={() => void events.refetch()}>
            Reintentar eventos
          </Button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section
          aria-label={`Calendario de ${monthLabel(month)}`}
          aria-busy={events.isPending}
          className="overflow-hidden rounded-2xl border border-border bg-card"
        >
          <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="py-2">
                {weekday}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((day) => {
              const items = byDay.get(day) ?? [];
              const inMonth = isInMonth(day, month);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => go(month, day)}
                  aria-pressed={day === selected}
                  aria-label={`${dayTitle(day)}${items.length ? `, ${items.length} ${items.length === 1 ? "elemento" : "elementos"}` : ""}`}
                  className={cn(
                    "flex min-h-[72px] flex-col gap-1 border-b border-r border-border p-1.5 text-left transition-colors hover:bg-muted/40 sm:min-h-[104px]",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                    day === selected && "bg-[var(--accent-soft)]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      day === today && "bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                    {items.slice(0, MAX_IN_CELL).map((item) => (
                      <span key={item.id} className="flex items-center gap-1 text-[11px] leading-tight">
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: KINDS[item.kind].color }}
                        />
                        <span className="truncate">
                          {item.time ? `${item.time} ` : ""}
                          {item.title}
                        </span>
                      </span>
                    ))}
                    {items.length > MAX_IN_CELL && (
                      <span className="text-[11px] text-muted-foreground">
                        +{items.length - MAX_IN_CELL} más
                      </span>
                    )}
                  </span>
                  {items.length > 0 && (
                    <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                      {items.slice(0, 4).map((item) => (
                        <span
                          key={item.id}
                          className="size-1.5 rounded-full"
                          style={{ background: KINDS[item.kind].color }}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <DayAgenda day={selected} items={byDay.get(selected) ?? []} />
      </div>
    </div>
  );
}

function DayAgenda({ day, items }: { day: string; items: CalendarItem[] }) {
  return (
    <section
      aria-label="Agenda del día"
      className="h-fit space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold first-letter:uppercase">{dayTitle(day)}</h2>
        <Link
          href={`${CALENDAR_PATH}/new?date=${day}`}
          aria-label="Nuevo evento este día"
          className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
        >
          <Plus size={14} />
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
          <CalendarDays size={22} />
          <p>Nada agendado para este día.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-start gap-2 rounded-xl border border-border p-2.5 text-sm transition-colors hover:bg-muted/50"
              >
                <span
                  aria-hidden
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ background: KINDS[item.kind].color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.time ?? "Todo el día"} · {KINDS[item.kind].label}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

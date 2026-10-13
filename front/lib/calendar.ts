import type { CalendarEvent, CalendarEventInput } from './api/calendar';
import type { AccountsReceivable } from './api/payments';
import type { PurchaseOrder } from './api/procurement';
import { parseISODate, toISODate } from './date';

export const CALENDAR_PATH = '/dashboard/calendar';
const ZONE = 'America/Asuncion';
const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export interface Month {
  year: number;
  /** 1 a 12. */
  month: number;
}

export const monthLabel = ({ year, month }: Month) => `${MONTHS[month - 1]} de ${year}`;
export const monthKey = ({ year, month }: Month) => `${year}-${String(month).padStart(2, '0')}`;

export function parseMonth(value: string | null, today: string): Month {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '') ?? /^(\d{4})-(\d{2})/.exec(today)!;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: Number(match[1]), month } : parseMonth(null, today);
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** Las 42 celdas del mes, desde el domingo de la semana del día 1. */
export function monthGrid({ year, month }: Month): string[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = first.getTime() - first.getUTCDay() * DAY_MS;
  return Array.from({ length: 42 }, (_, index) => toISODate(new Date(start + index * DAY_MS)));
}

export const isInMonth = (day: string, month: Month) => day.startsWith(monthKey(month));

function zoneParts(instant: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** El día y la hora de Paraguay de un instante. */
export const instantParts = (iso: string) => zoneParts(new Date(iso));

/** El instante UTC de un día y una hora de Paraguay. */
export function zonedInstant(day: string, time: string): string {
  const wall = Date.parse(`${day}T${time}:00.000Z`);
  const offsetAt = (instant: number) => {
    const parts = zoneParts(new Date(instant));
    return Date.parse(`${parts.day}T${parts.time}:00.000Z`) - instant;
  };
  const guess = wall - offsetAt(wall);
  return new Date(wall - offsetAt(guess)).toISOString();
}

export type ItemKind = 'event' | 'company' | 'installment' | 'purchase';
export interface CalendarItem {
  id: string;
  kind: ItemKind;
  title: string;
  day: string;
  /** null = todo el día. */
  time: string | null;
  href: string;
}

export const KINDS: Record<ItemKind, { label: string; color: string }> = {
  event: { label: 'Mis eventos', color: 'var(--info)' },
  company: { label: 'De la empresa', color: 'var(--accent-text)' },
  installment: { label: 'Cobros', color: 'var(--warn)' },
  purchase: { label: 'Compras esperadas', color: 'var(--danger)' },
};

const daysBetween = (first: string, last: string): string[] => {
  const start = parseISODate(first)!.getTime();
  const count = Math.max(0, Math.round((parseISODate(last)!.getTime() - start) / DAY_MS));
  return Array.from({ length: Math.min(count, 366) + 1 }, (_, index) => toISODate(new Date(start + index * DAY_MS)));
};

/** Un evento ocupa cada día que abarca. */
export function eventItems(events: CalendarEvent[], meId: string | undefined): CalendarItem[] {
  return events.flatMap((event) => {
    const start = event.allDay ? { day: event.startsAt.slice(0, 10), time: null } : instantParts(event.startsAt);
    const endDay = event.allDay ? event.endsAt.slice(0, 10) : instantParts(event.endsAt).day;
    return daysBetween(start.day, endDay).map((day, index) => ({
      id: `event-${event.id}-${day}`,
      kind: event.createdBy === meId ? ('event' as const) : ('company' as const),
      title: event.title,
      day,
      time: index === 0 ? start.time : null,
      href: `${CALENDAR_PATH}/${event.id}`,
    }));
  });
}

const customerName = (ar: AccountsReceivable) => {
  const { firstName, lastName } = ar.invoice.saleOrder.customer;
  return `${firstName} ${lastName}`.trim();
};

/** Lo que falta cobrar: cada cuota sin pagar, o la cuenta al contado. */
export function installmentItems(receivables: AccountsReceivable[]): CalendarItem[] {
  return receivables.flatMap((ar) => {
    if (ar.status === 'PAID' || ar.status === 'CANCELLED') return [];
    const href = `/dashboard/payments?ar=${ar.id}`;
    const installments = ar.invoice.saleOrder.loan?.installments;
    if (!installments) {
      return ar.dueDate
        ? [{ id: `ar-${ar.id}`, kind: 'installment' as const, title: `Cobro · ${customerName(ar)}`, day: ar.dueDate.slice(0, 10), time: null, href }]
        : [];
    }
    return installments
      .filter((installment) => installment.status !== 'PAID')
      .map((installment) => ({
        id: `ar-${ar.id}-${installment.number}`,
        kind: 'installment' as const,
        title: `Cuota ${installment.number} · ${customerName(ar)}`,
        day: installment.dueDate.slice(0, 10),
        time: null,
        href,
      }));
  });
}

/** Órdenes de compra que todavía se esperan. */
export function purchaseItems(orders: PurchaseOrder[]): CalendarItem[] {
  return orders
    .filter((order) => (order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED') && order.expectedDate)
    .map((order) => ({
      id: `po-${order.id}`,
      kind: 'purchase' as const,
      title: `${order.orderNumber ?? 'Compra'} · ${order.supplier.name}`,
      day: order.expectedDate!.slice(0, 10),
      time: null,
      href: `/dashboard/procurement/orders/${order.id}`,
    }));
}

/** Por día; primero lo de todo el día, después por hora. */
export function itemsByDay(items: CalendarItem[], hidden: ReadonlySet<ItemKind> = new Set()): Map<string, CalendarItem[]> {
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    if (hidden.has(item.kind)) continue;
    byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title));
  }
  return byDay;
}

export interface EventForm {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
  companyWide: boolean;
}

export function emptyForm(day: string): EventForm {
  return { title: '', description: '', location: '', allDay: false, startDay: day, startTime: '09:00', endDay: day, endTime: '10:00', companyWide: false };
}

export function formOf(event: CalendarEvent): EventForm {
  const start = event.allDay ? { day: event.startsAt.slice(0, 10), time: '09:00' } : instantParts(event.startsAt);
  const end = event.allDay ? { day: event.endsAt.slice(0, 10), time: '10:00' } : instantParts(event.endsAt);
  return {
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    allDay: event.allDay,
    startDay: start.day,
    startTime: start.time,
    endDay: end.day,
    endTime: end.time,
    companyWide: event.companyWide,
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Por qué no se puede guardar; null si está bien. */
export function formError(form: EventForm): string | null {
  if (!form.title.trim()) return 'Poné un título.';
  if (!parseISODate(form.startDay) || !parseISODate(form.endDay)) return 'Elegí las fechas.';
  if (form.allDay) return form.endDay < form.startDay ? 'No puede terminar antes de empezar.' : null;
  if (!TIME.test(form.startTime) || !TIME.test(form.endTime)) return 'Poné las horas como HH:MM.';
  return `${form.endDay}T${form.endTime}` < `${form.startDay}T${form.startTime}` ? 'No puede terminar antes de empezar.' : null;
}

export function eventInput(form: EventForm): CalendarEventInput {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    location: form.location.trim() || null,
    allDay: form.allDay,
    startsAt: form.allDay ? `${form.startDay}T00:00:00.000Z` : zonedInstant(form.startDay, form.startTime),
    endsAt: form.allDay ? `${form.endDay}T00:00:00.000Z` : zonedInstant(form.endDay, form.endTime),
    companyWide: form.companyWide,
  };
}

const compact = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Enlace que abre Google Calendar con el evento ya cargado. */
export function googleCalendarUrl(event: Pick<CalendarEvent, 'title' | 'description' | 'location' | 'allDay' | 'startsAt' | 'endsAt'>): string {
  const dates = event.allDay
    ? `${compact(event.startsAt).slice(0, 8)}/${compact(new Date(Date.parse(event.endsAt) + DAY_MS).toISOString()).slice(0, 8)}`
    : `${compact(event.startsAt)}/${compact(event.endsAt)}`;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates });
  if (event.description) params.set('details', event.description);
  if (event.location) params.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** La dirección que se pega en Google Calendar, Outlook o Apple. */
export const feedUrl = (apiBase: string, token: string) => `${apiBase}/calendar/feeds/${token}.ics`;

const DAY_TITLE = new Intl.DateTimeFormat('es-PY', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
export const dayTitle = (day: string) => DAY_TITLE.format(parseISODate(day)!);

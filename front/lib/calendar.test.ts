import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from './api/calendar';
import type { AccountsReceivable } from './api/payments';
import type { PurchaseOrder } from './api/procurement';
import {
  dayTitle,
  emptyForm,
  eventInput,
  eventItems,
  formError,
  formOf,
  installmentItems,
  instantParts,
  isInMonth,
  itemsByDay,
  monthGrid,
  monthLabel,
  parseMonth,
  purchaseItems,
  shiftMonth,
  zonedInstant,
} from './calendar';

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  createdBy: 'me',
  title: 'Reunión de cobranzas',
  description: null,
  location: null,
  allDay: false,
  startsAt: '2026-10-14T13:00:00.000Z',
  endsAt: '2026-10-14T14:00:00.000Z',
  companyWide: false,
  updatedAt: '2026-10-13T12:00:00.000Z',
  ...overrides,
});

describe('months', () => {
  it('reads the month from the link and falls back to today', () => {
    expect(parseMonth('2026-12', '2026-10-13')).toEqual({ year: 2026, month: 12 });
    expect(parseMonth(null, '2026-10-13')).toEqual({ year: 2026, month: 10 });
    expect(parseMonth('2026-13', '2026-10-13')).toEqual({ year: 2026, month: 10 });
  });

  it('moves across the end of the year', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('names the month', () => {
    expect(monthLabel({ year: 2026, month: 10 })).toBe('octubre de 2026');
  });

  // Octubre de 2026 empieza un jueves.
  it('lays out six weeks from the Sunday before the first', () => {
    const grid = monthGrid({ year: 2026, month: 10 });

    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-09-27');
    expect(grid[4]).toBe('2026-10-01');
    expect(grid[41]).toBe('2026-11-07');
    expect(isInMonth(grid[0], { year: 2026, month: 10 })).toBe(false);
    expect(isInMonth(grid[4], { year: 2026, month: 10 })).toBe(true);
  });
});

describe('Paraguay time', () => {
  it('turns a local day and time into the UTC instant and back', () => {
    const instant = zonedInstant('2026-10-14', '10:00');

    expect(instant).toBe('2026-10-14T13:00:00.000Z');
    expect(instantParts(instant)).toEqual({ day: '2026-10-14', time: '10:00' });
  });

  // 22:30 de Paraguay ya es el día siguiente en UTC.
  it('keeps the local day late at night', () => {
    const instant = zonedInstant('2026-10-14', '22:30');

    expect(instant).toBe('2026-10-15T01:30:00.000Z');
    expect(instantParts(instant).day).toBe('2026-10-14');
  });
});

describe('eventItems', () => {
  it('places a timed event on its local day with its time', () => {
    expect(eventItems([event()], 'me')).toEqual([
      { id: 'event-e1-2026-10-14', kind: 'event', title: 'Reunión de cobranzas', day: '2026-10-14', time: '10:00', href: '/dashboard/calendar/e1' },
    ]);
  });

  it('marks what someone else shared with the company', () => {
    expect(eventItems([event({ createdBy: 'ana', companyWide: true })], 'me')[0].kind).toBe('company');
  });

  it('spreads an all-day event over every day it covers', () => {
    const items = eventItems(
      [event({ allDay: true, startsAt: '2026-10-14T00:00:00.000Z', endsAt: '2026-10-16T00:00:00.000Z' })],
      'me',
    );

    expect(items.map((item) => [item.day, item.time])).toEqual([
      ['2026-10-14', null],
      ['2026-10-15', null],
      ['2026-10-16', null],
    ]);
  });

  it('shows the time only on the first day of an event that crosses midnight', () => {
    const items = eventItems([event({ startsAt: '2026-10-15T01:30:00.000Z', endsAt: '2026-10-15T05:00:00.000Z' })], 'me');

    expect(items.map((item) => [item.day, item.time])).toEqual([
      ['2026-10-14', '22:30'],
      ['2026-10-15', null],
    ]);
  });
});

describe('what the ERP adds to the calendar', () => {
  const receivable = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'ar1',
      status: 'PARTIAL',
      dueDate: '2026-10-05T00:00:00.000Z',
      invoice: {
        saleOrder: {
          customer: { firstName: 'María', lastName: 'López' },
          loan: {
            installments: [
              { number: 1, dueDate: '2026-09-05T00:00:00.000Z', status: 'PAID' },
              { number: 2, dueDate: '2026-10-05T00:00:00.000Z', status: 'OVERDUE' },
              { number: 3, dueDate: '2026-11-05T00:00:00.000Z', status: 'PENDING' },
            ],
          },
        },
      },
      ...overrides,
    }) as unknown as AccountsReceivable;

  it('adds each unpaid installment on its due date', () => {
    expect(installmentItems([receivable()]).map((item) => [item.title, item.day, item.href])).toEqual([
      ['Cuota 2 · María López', '2026-10-05', '/dashboard/payments?ar=ar1'],
      ['Cuota 3 · María López', '2026-11-05', '/dashboard/payments?ar=ar1'],
    ]);
  });

  it('adds a cash account on its due date', () => {
    const cash = receivable({
      status: 'PENDING',
      invoice: { saleOrder: { customer: { firstName: 'Pedro', lastName: 'Ruiz' }, loan: null } },
    });

    expect(installmentItems([cash]).map((item) => [item.title, item.day])).toEqual([['Cobro · Pedro Ruiz', '2026-10-05']]);
  });

  it('leaves out what is already paid', () => {
    expect(installmentItems([receivable({ status: 'PAID' })])).toEqual([]);
  });

  it('adds the purchase orders still expected', () => {
    const order = (id: string, status: string, expectedDate: string | null) =>
      ({ id, status, expectedDate, orderNumber: `OC-26-00000${id}`, supplier: { name: 'Distribuidora SA' } }) as unknown as PurchaseOrder;

    const items = purchaseItems([
      order('1', 'CONFIRMED', '2026-10-20T00:00:00.000Z'),
      order('2', 'RECEIVED', '2026-10-21T00:00:00.000Z'),
      order('3', 'CONFIRMED', null),
    ]);

    expect(items).toEqual([
      { id: 'po-1', kind: 'purchase', title: 'OC-26-000001 · Distribuidora SA', day: '2026-10-20', time: null, href: '/dashboard/procurement/orders/1' },
    ]);
  });
});

describe('itemsByDay', () => {
  const item = (id: string, time: string | null, kind: 'event' | 'installment' = 'event') => ({
    id,
    kind,
    title: id,
    day: '2026-10-14',
    time,
    href: '#',
  });

  it('puts whole-day items first, then by time', () => {
    const byDay = itemsByDay([item('b', '15:00'), item('a', '09:00'), item('c', null)]);

    expect(byDay.get('2026-10-14')!.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
  });

  it('leaves out the layers that were turned off', () => {
    const byDay = itemsByDay([item('a', null), item('b', null, 'installment')], new Set(['installment']));

    expect(byDay.get('2026-10-14')!.map((entry) => entry.id)).toEqual(['a']);
  });
});

describe('the event form', () => {
  it('starts as one hour on the chosen day', () => {
    expect(emptyForm('2026-10-14')).toMatchObject({ startDay: '2026-10-14', startTime: '09:00', endDay: '2026-10-14', endTime: '10:00', allDay: false });
  });

  it('says what is missing or wrong', () => {
    const form = { ...emptyForm('2026-10-14'), title: 'Reunión' };

    expect(formError(form)).toBeNull();
    expect(formError({ ...form, title: '  ' })).toBe('Poné un título.');
    expect(formError({ ...form, endTime: '08:00' })).toBe('No puede terminar antes de empezar.');
    expect(formError({ ...form, startTime: '25:00' })).toBe('Poné las horas como HH:MM.');
    expect(formError({ ...form, allDay: true, endDay: '2026-10-13' })).toBe('No puede terminar antes de empezar.');
    expect(formError({ ...form, allDay: true, startTime: 'x' })).toBeNull();
  });

  it('sends local times as UTC and whole days as dates', () => {
    const form = { ...emptyForm('2026-10-14'), title: ' Reunión ', location: ' Sala 1 ' };

    expect(eventInput(form)).toEqual({
      title: 'Reunión',
      description: null,
      location: 'Sala 1',
      allDay: false,
      startsAt: '2026-10-14T12:00:00.000Z',
      endsAt: '2026-10-14T13:00:00.000Z',
      companyWide: false,
    });
    expect(eventInput({ ...form, allDay: true, endDay: '2026-10-15' })).toMatchObject({
      startsAt: '2026-10-14T00:00:00.000Z',
      endsAt: '2026-10-15T00:00:00.000Z',
    });
  });

  it('loads a saved event back into the form in local time', () => {
    expect(formOf(event({ description: 'Traer la planilla' }))).toMatchObject({
      title: 'Reunión de cobranzas',
      description: 'Traer la planilla',
      startDay: '2026-10-14',
      startTime: '10:00',
      endTime: '11:00',
    });
  });
});

describe('day titles', () => {
  it('names a day in full', () => {
    expect(dayTitle('2026-10-14')).toBe('miércoles, 14 de octubre');
  });
});

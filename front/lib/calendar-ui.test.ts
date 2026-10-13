import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarPage from '@/app/(dashboard)/dashboard/calendar/page';
import { EventForm } from '@/components/calendar/event-form';
import { emptyForm } from './calendar';
import { WS_EVENT_MAP } from './ws-event-map';

const state = vi.hoisted(() => ({
  search: 'm=2026-10&d=2026-10-14',
  permissions: [] as string[],
  modules: [] as string[],
  fails: false,
  queryKeys: [] as { key: unknown[]; enabled: boolean }[],
}));

beforeEach(() => {
  state.search = 'm=2026-10&d=2026-10-14';
  state.permissions = [];
  state.modules = [];
  state.fails = false;
  state.queryKeys = [];
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    jwtPayload: { sub: 'me', tenantId: 'tenant-1', permissions: state.permissions, activeModules: state.modules },
  }),
}));

vi.mock('@/lib/use-active-modules', () => ({
  useActiveModules: () => ({ hasModule: (name: string) => state.modules.includes(name) }),
}));

const EVENTS = [
  {
    id: 'e1', createdBy: 'me', title: 'Reunión de cobranzas', description: null, location: null,
    allDay: false, startsAt: '2026-10-14T13:00:00.000Z', endsAt: '2026-10-14T14:00:00.000Z',
    companyWide: false, updatedAt: '2026-10-13T12:00:00.000Z',
  },
  {
    id: 'e2', createdBy: 'ana', title: 'Feriado interno', description: null, location: null,
    allDay: true, startsAt: '2026-10-20T00:00:00.000Z', endsAt: '2026-10-20T00:00:00.000Z',
    companyWide: true, updatedAt: '2026-10-13T12:00:00.000Z',
  },
];
const RECEIVABLES = [
  {
    id: 'ar1', status: 'PARTIAL', dueDate: '2026-10-14T00:00:00.000Z',
    invoice: {
      saleOrder: {
        customer: { firstName: 'María', lastName: 'López' },
        loan: { installments: [{ number: 2, dueDate: '2026-10-14T00:00:00.000Z', status: 'PENDING' }] },
      },
    },
  },
];

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) => {
    state.queryKeys.push({ key: queryKey, enabled: enabled !== false });
    const isEvents = queryKey[0] === 'calendar';
    const data = enabled === false
      ? undefined
      : isEvents
        ? EVENTS
        : queryKey[0] === 'accounts-receivable'
          ? RECEIVABLES
          : [];
    return {
      isPending: false,
      error: isEvents && state.fails ? new Error('Unavailable') : null,
      data: isEvents && state.fails ? undefined : data,
      refetch: () => Promise.resolve(),
    };
  },
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ error: null, isPending: false, mutate: () => undefined }),
}));

const page = () => renderToStaticMarkup(createElement(CalendarPage));

describe('Calendar', () => {
  it('shows the month of the link with its events on their days', () => {
    const html = page();

    expect(html).toContain('octubre de 2026');
    expect(html).toContain('10:00 Reunión de cobranzas');
    expect(html).toContain('Feriado interno');
    expect(html).toMatch(/aria-label="miércoles, 14 de octubre, 1 elemento"/);
  });

  it('lists the selected day with a way into each item and to add an event that day', () => {
    const html = page();

    expect(html).toContain('href="/dashboard/calendar/e1"');
    expect(html).toContain('10:00 · Mis eventos');
    expect(html).toContain('href="/dashboard/calendar/new?date=2026-10-14"');
  });

  it('asks only for the events of the signed-in user, for the six weeks on screen', () => {
    page();

    expect(state.queryKeys).toContainEqual({
      key: ['calendar', 'tenant-1', 'me', 'events', '2026-09-27', '2026-11-07'],
      enabled: true,
    });
  });

  // Sin el permiso o con el módulo apagado, ni se pide ni se ofrece la capa.
  it('adds what is left to collect only to who can see collections', () => {
    expect(page()).not.toContain('Cuota 2 · María López');
    expect(state.queryKeys.find((query) => query.key[0] === 'accounts-receivable')?.enabled).toBe(false);

    state.permissions = ['payments:read'];
    state.modules = ['payments'];
    const html = page();

    expect(html).toContain('Cuota 2 · María López');
    expect(html).toContain('href="/dashboard/payments?ar=ar1"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(<span[^>]*><\/span>)?Cobros<\/button>/);
  });

  it('says so when the selected day has nothing', () => {
    state.search = 'm=2026-10&d=2026-10-02';

    expect(page()).toContain('Nada agendado para este día.');
  });

  it('offers a retry when the events fail to load', () => {
    state.fails = true;

    const html = page();

    expect(html).toContain('role="alert"');
    expect(html).toContain('Reintentar eventos');
  });

  it('links to the way of connecting another calendar', () => {
    expect(page()).toContain('href="/dashboard/calendar/sync"');
  });
});

describe('EventForm', () => {
  const form = (overrides: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(EventForm, {
        initial: { ...emptyForm('2026-10-14'), ...overrides },
        submitLabel: 'Guardar evento',
        pending: false,
        error: null,
        onSubmit: () => undefined,
      }),
    );

  it('asks for the hours of a timed event and hides them for a whole day', () => {
    expect(form()).toContain('aria-label="Hora de inicio"');
    expect(form({ allDay: true })).not.toContain('aria-label="Hora de inicio"');
  });

  it('explains what sharing with the company means', () => {
    expect(form()).toContain('Visible para toda la empresa');
    expect(form()).toContain('no modificarlo');
  });
});

describe('real-time refresh', () => {
  it('refreshes the calendar when a company event changes', () => {
    expect(WS_EVENT_MAP['calendar.changed']).toEqual([['calendar']]);
  });
});

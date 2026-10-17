import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommunicationsPage from '@/app/(dashboard)/dashboard/communications/page';
import { EntityTimeline } from '@/components/communications/entity-timeline';
import { CommunicationConfiguration } from '@/components/communications/communication-settings';

type QueryMode = 'error' | 'cache' | 'disabled' | 'settingsErrors' | 'timelineError' | 'threadError' | 'noticesError';

const auth = vi.hoisted(() => ({
  permissions: ['communications:access'],
  activeModules: [] as string[],
  liveModules: null as string[] | null,
  search: '',
  queryMode: 'error' as QueryMode,
  queryKeys: [] as unknown[][],
}));

const READER = ['communications:access', 'communications:delivery:read', 'billing:read'];

beforeEach(() => {
  auth.permissions = ['communications:access'];
  auth.activeModules = [];
  auth.liveModules = null;
  auth.search = '';
  auth.queryMode = 'error';
  auth.queryKeys = [];
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  useSearchParams: () => new URLSearchParams(auth.search),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    jwtPayload: {
      sub: 'user-1',
      tenantId: 'tenant-1',
      permissions: auth.permissions,
      activeModules: auth.activeModules,
    },
  }),
}));

vi.mock('@/lib/use-active-modules', () => ({
  useActiveModules: () => ({
    hasModule: (name: string) => (auth.liveModules ?? auth.activeModules).includes(name),
    activeModules: auth.liveModules ?? auth.activeModules,
    isLoading: false,
  }),
}));

const SETTINGS = { enabled: true, emailEnabled: true, invoiceEmailEnabled: false };
const CONTACT = {
  type: 'CUSTOMER',
  id: 'customer-1',
  code: 'CLI-26-000001',
  name: 'María López',
  email: 'maria@example.com',
  phone: null,
};

function dataFor(queryKey: unknown[]): unknown {
  if (queryKey.includes('settings')) {
    return auth.queryMode === 'disabled' ? { ...SETTINGS, enabled: false } : SETTINGS;
  }
  if (queryKey.includes('identities') || queryKey.includes('templates')) return [];
  if (queryKey.includes('conversations-summary')) return { problemConversations: 1, problemMessages: 1 };
  if (queryKey.includes('conversations')) {
    return {
      items: [
        {
          contact: CONTACT,
          messages: 1,
          notes: 1,
          problems: 1,
          lastAt: '2026-10-10T14:00:00.000Z',
          lastMessage: {
            id: 'message-1',
            subject: 'Factura 001',
            status: 'FAILED',
            createdAt: '2026-10-10T14:00:00.000Z',
          },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    };
  }
  if (queryKey.includes('thread')) {
    return {
      contact: CONTACT,
      items: [
        {
          kind: 'NOTE',
          id: 'note-1',
          entityType: 'CUSTOMER',
          entityId: 'customer-1',
          body: 'Paga el viernes',
          createdAt: '2026-10-10T15:00:00.000Z',
          author: { firstName: 'Juan', lastName: 'Pérez' },
        },
        {
          kind: 'MESSAGE',
          id: 'message-1',
          entityType: 'INVOICE',
          entityId: 'invoice-1',
          recipient: 'maria@example.com',
          subject: 'Factura 001',
          bodyText: 'Adjuntamos la factura.',
          fromEmail: 'ventas@example.com',
          fromName: null,
          status: 'FAILED',
          sentAt: null,
          lastError: 'Buzón inexistente',
          createdAt: '2026-10-10T14:00:00.000Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    };
  }
  if (queryKey[0] === 'communication-notifications') {
    return {
      items: [
        {
          id: 'notice-1',
          title: 'No se pudo enviar el correo de factura',
          body: 'Buzón inexistente',
          createdAt: '2026-10-10T14:00:00.000Z',
          readAt: null,
          messageId: 'message-1',
          contact: { type: 'CUSTOMER', id: 'customer-1' },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      unreadCount: 1,
    };
  }
  if (queryKey[0] === 'communication-timeline') return { items: [], total: 0, page: 1, limit: 20 };
  if (queryKey[0] === 'accounts-receivable') return [];
  return undefined;
}

function failsFor(queryKey: unknown[]): boolean {
  switch (auth.queryMode) {
    case 'error':
      return true;
    case 'settingsErrors':
      return queryKey.includes('identities') || queryKey.includes('templates');
    case 'timelineError':
      return queryKey[0] === 'communication-timeline';
    case 'threadError':
      return queryKey.includes('thread');
    case 'noticesError':
      return queryKey[0] === 'communication-notifications';
    default:
      return false;
  }
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) => {
    auth.queryKeys.push(queryKey);
    const failed = enabled !== false && failsFor(queryKey);
    return {
      isPending: false,
      error: failed ? new Error('Unavailable') : null,
      data: failed || enabled === false ? undefined : dataFor(queryKey),
      refetch: () => Promise.resolve(),
    };
  },
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ error: null, isPending: false, isSuccess: false, mutate: () => undefined }),
}));

const page = () => renderToStaticMarkup(createElement(CommunicationsPage));
const configuration = () =>
  renderToStaticMarkup(createElement(CommunicationConfiguration, { settings: SETTINGS }));
const timeline = () =>
  renderToStaticMarkup(createElement(EntityTimeline, { entityType: 'INVOICE', entityId: 'invoice-1' }));

describe('Communications inbox', () => {
  it('offers a retry when the initial settings request fails', () => {
    const html = page();

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<button[^>]*>[^<]*Reintentar/);
  });

  it('explains how to turn it on, with the way to the settings for whoever can manage it', () => {
    auth.queryMode = 'disabled';
    auth.permissions = ['communications:access', 'communications:settings:manage'];

    const html = page();

    expect(html).toContain('todavía no está activado');
    expect(html).toContain('href="/dashboard/settings?tab=communications"');
    expect(html).not.toContain('aria-label="Bandejas"');
  });

  it('lists the conversations by customer, with the problem first', () => {
    auth.permissions = READER;
    auth.activeModules = ['billing'];
    auth.queryMode = 'cache';

    const html = page();

    expect(html).toContain('María López');
    expect(html).toContain('No se pudo enviar · Factura 001');
    expect(html).toContain('Elegí una conversación');
  });

  it('opens the conversation named in the link: emails and internal notes together', () => {
    auth.permissions = [...READER, 'communications:notes:create', 'communications:email:send'];
    auth.activeModules = ['billing'];
    auth.queryMode = 'cache';
    auth.search = 'contact=customer-1';

    const html = page();

    expect(html).toContain('Correo para maria@example.com');
    expect(html).toContain('Buzón inexistente');
    expect(html).toMatch(/<button[^>]*>Reintentar envío<\/button>/);
    expect(html).toContain('Nota interna · Juan Pérez');
    expect(html).toContain('Paga el viernes');
    expect(html).toContain('href="/dashboard/billing/invoices/invoice-1"');
    expect(html).toMatch(/<button[^>]*>Guardar nota<\/button>/);
  });

  // La nota es más nueva que el correo: tiene que quedar debajo.
  it('reads the conversation oldest first', () => {
    auth.permissions = READER;
    auth.activeModules = ['billing'];
    auth.queryMode = 'cache';
    auth.search = 'contact=customer-1';

    const html = page();

    expect(html.indexOf('Correo para maria@example.com')).toBeLessThan(html.indexOf('Paga el viernes'));
  });

  it('does not offer to retry or to write notes without those permissions', () => {
    auth.permissions = READER;
    auth.activeModules = ['billing'];
    auth.queryMode = 'cache';
    auth.search = 'contact=customer-1';

    const html = page();

    expect(html).toContain('Factura 001');
    expect(html).not.toContain('Reintentar envío');
    expect(html).not.toContain('Guardar nota');
  });

  it('offers a retry when the conversation fails to load', () => {
    auth.permissions = READER;
    auth.activeModules = ['billing'];
    auth.queryMode = 'threadError';
    auth.search = 'contact=customer-1';

    expect(page()).toContain('Reintentar conversación');
  });

  it('shows only the personal notices to someone who cannot read conversations', () => {
    auth.queryMode = 'cache';
    auth.search = 'box=problems&contact=customer-1';

    const html = page();

    expect(html).toContain('No se pudo enviar el correo de factura');
    expect(html).not.toContain('Ver conversación');
    expect(html).not.toContain('María López');
  });

  it('takes a reader from a notice to its conversation', () => {
    auth.permissions = READER;
    auth.activeModules = ['billing'];
    auth.queryMode = 'cache';
    auth.search = 'box=notices';

    expect(page()).toMatch(/<button[^>]*>Ver conversación<\/button>/);
  });

  it('offers a retry when the notices fail to load', () => {
    auth.queryMode = 'noticesError';

    expect(page()).toContain('Reintentar avisos');
  });
});

describe('live module and permission gates', () => {
  it('shows conversations when billing is live even if the JWT snapshot is stale and inactive', () => {
    auth.permissions = READER;
    auth.activeModules = [];
    auth.liveModules = ['billing'];
    auth.queryMode = 'cache';

    expect(page()).toContain('María López');
  });

  it('hides conversations when billing is no longer live despite the JWT snapshot', () => {
    auth.permissions = READER;
    auth.activeModules = ['billing'];
    auth.liveModules = [];
    auth.queryMode = 'cache';

    const html = page();

    expect(html).not.toContain('María López');
    expect(html).toContain('Mis avisos');
  });

  it('shows the invoice timeline when billing becomes live after login', () => {
    auth.permissions = READER;
    auth.activeModules = [];
    auth.liveModules = ['billing'];

    expect(timeline()).toContain('Comunicaciones');
  });

  it('hides the invoice timeline when billing is deactivated after login', () => {
    auth.permissions = READER;
    auth.activeModules = ['billing'];
    auth.liveModules = [];

    expect(timeline()).toBe('');
  });

  it('hides the SMTP integrations link without integration access', () => {
    auth.permissions = ['communications:access', 'communications:settings:manage'];
    auth.queryMode = 'cache';

    const html = configuration();

    expect(html).not.toContain('href="/dashboard/settings?tab=integrations"');
    expect(html).toContain('integraciones');
  });

  it('shows the SMTP integrations link with read access', () => {
    auth.permissions = ['communications:access', 'communications:settings:manage', 'integrations:read'];
    auth.queryMode = 'cache';

    expect(configuration()).toContain('href="/dashboard/settings?tab=integrations"');
  });

  it('does not offer a read-backed integrations view with manage access alone', () => {
    auth.permissions = ['communications:access', 'communications:settings:manage', 'integrations:manage'];
    auth.queryMode = 'cache';

    expect(configuration()).not.toContain('href="/dashboard/settings?tab=integrations"');
  });
});

describe('Communications recovery actions', () => {
  it('offers separate retries for identities and template versions', () => {
    auth.queryMode = 'settingsErrors';

    const html = configuration();

    expect(html).toContain('Reintentar identidades');
    expect(html).toContain('Reintentar versiones');
  });

  it('offers a retry when the invoice history request fails', () => {
    auth.permissions = READER;
    auth.activeModules = ['billing'];
    auth.queryMode = 'timelineError';

    expect(timeline()).toContain('Reintentar historial');
  });
});

describe('EntityTimeline', () => {
  it('does not expose the invoice timeline without billing read permission', () => {
    auth.permissions = ['communications:access', 'communications:delivery:read'];
    auth.activeModules = ['billing'];

    expect(timeline()).toBe('');
  });

  it('offers a retry action when timeline settings fail to load', () => {
    auth.permissions = READER;
    auth.activeModules = ['billing'];

    const html = timeline();

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<button[^>]*>[^<]*Reintentar/);
  });
});

describe('cache scope', () => {
  it('scopes every query to the signed-in user', () => {
    auth.permissions = [...READER, 'communications:settings:manage'];
    auth.activeModules = ['billing'];
    auth.queryMode = 'cache';
    auth.search = 'contact=customer-1';

    page();
    configuration();
    timeline();

    const scope = ['communications', 'tenant-1', 'user-1'];
    expect(auth.queryKeys).toContainEqual([...scope, 'settings']);
    expect(auth.queryKeys).toContainEqual([...scope, 'identities']);
    expect(auth.queryKeys).toContainEqual([...scope, 'templates']);
    expect(auth.queryKeys).toContainEqual([...scope, 'conversations-summary']);
    expect(auth.queryKeys).toContainEqual([...scope, 'thread', 'customer-1', 1]);
    expect(auth.queryKeys).toContainEqual(['communication-timeline', 'tenant-1', 'user-1', 'INVOICE', 'invoice-1', 1]);
  });
});

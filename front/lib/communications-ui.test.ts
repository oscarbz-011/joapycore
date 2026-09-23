import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommunicationCenterPage from '@/app/(dashboard)/dashboard/applications/communications/page';
import { EntityTimeline } from '@/components/communications/entity-timeline';
import { CommunicationConfiguration } from '@/components/communications/communication-settings';

const auth = vi.hoisted(() => ({
  permissions: ['communications:access'],
  activeModules: [] as string[],
  forceNotifications: false,
  queryMode: 'error' as 'error' | 'notifications' | 'cache' | 'settingsErrors' | 'notificationsError' | 'timelineError' | 'detailError',
  queryKeys: [] as unknown[][],
}));

beforeEach(() => {
  auth.permissions = ['communications:access'];
  auth.activeModules = [];
  auth.forceNotifications = false;
  auth.queryMode = 'error';
  auth.queryKeys = [];
});

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useState: <T,>(initial: T) => react.useState(
      auth.forceNotifications && initial === 'deliveries' ? 'notifications' as T : initial,
    ),
  };
});

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

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    auth.queryKeys.push(queryKey);
    if (['settingsErrors', 'notificationsError', 'timelineError', 'detailError'].includes(auth.queryMode)) {
      const isError = (auth.queryMode === 'settingsErrors' && (queryKey.includes('identities') || queryKey.includes('templates')))
        || (auth.queryMode === 'notificationsError' && queryKey[0] === 'communication-notifications')
        || (auth.queryMode === 'timelineError' && queryKey[0] === 'communication-timeline')
        || (auth.queryMode === 'detailError' && queryKey.includes('detail'));
      const data = queryKey.includes('settings')
        ? { enabled: true, emailEnabled: true, invoiceEmailEnabled: false }
        : queryKey.includes('messages') && !queryKey.includes('detail')
          ? { items: [{
              id: 'message-1', subject: 'Factura', recipient: 'client@example.com',
              status: 'FAILED', createdAt: '2026-09-18T12:00:00.000Z',
            }], total: 1, page: 1, limit: 20 }
          : undefined;
      return {
        isPending: false,
        error: isError ? new Error('Unavailable') : null,
        data: isError ? undefined : data,
        refetch: () => Promise.resolve(),
      };
    }
    if (auth.queryMode === 'notifications') {
      return {
        isPending: false,
        error: null,
        data: queryKey[0] === 'communication-notifications'
          ? {
              items: [{
                id: 'notice-1', title: 'Entrega fallida', body: 'Revisá el mensaje',
                createdAt: '2026-09-18T12:00:00.000Z', readAt: null, messageId: 'message-1',
              }],
              total: 1, page: 1, limit: 20, unreadCount: 1,
            }
          : { enabled: true, emailEnabled: true, invoiceEmailEnabled: false },
        refetch: () => Promise.resolve(),
      };
    }
    if (auth.queryMode === 'cache') {
      const data = queryKey.includes('settings')
        ? { enabled: true, emailEnabled: true, invoiceEmailEnabled: false }
        : queryKey.includes('identities') || queryKey.includes('templates')
          ? []
          : queryKey.includes('detail')
            ? undefined
            : { items: [], total: 0, page: 1, limit: 20 };
      return {
        isPending: false,
        error: null,
        data,
        refetch: () => Promise.resolve(),
      };
    }
    return {
      isPending: false,
      error: new Error('Settings unavailable'),
      data: undefined,
      refetch: () => Promise.resolve(),
    };
  },
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ error: null, isPending: false, isSuccess: false, mutate: () => undefined }),
}));

describe('CommunicationCenterPage', () => {
  it('offers a retry action when the initial settings request fails', () => {
    const html = renderToStaticMarkup(createElement(CommunicationCenterPage));

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<button[^>]*>[^<]*Reintentar/);
  });
});

describe('Communications recovery actions', () => {
  it('offers separate retries for identities and template versions', () => {
    auth.queryMode = 'settingsErrors';

    const html = renderToStaticMarkup(createElement(CommunicationConfiguration, {
      settings: { enabled: true, emailEnabled: true, invoiceEmailEnabled: false },
    }));

    expect(html).toContain('Reintentar identidades');
    expect(html).toContain('Reintentar versiones');
  });

  it('offers a retry when the invoice history request fails', () => {
    auth.permissions = ['communications:access', 'communications:delivery:read', 'billing:read'];
    auth.activeModules = ['billing'];
    auth.queryMode = 'timelineError';

    const html = renderToStaticMarkup(createElement(EntityTimeline, { entityType: 'INVOICE', entityId: 'invoice-1' }));

    expect(html).toContain('Reintentar historial');
  });

  it('offers a retry when notifications fail to load', () => {
    auth.permissions = ['communications:access'];
    auth.activeModules = [];
    auth.forceNotifications = false;
    auth.queryMode = 'notificationsError';

    const html = renderToStaticMarkup(createElement(CommunicationCenterPage));

    expect(html).toContain('Reintentar notificaciones');
  });

  it('offers a retry when the selected message fails to load', () => {
    auth.permissions = ['communications:access', 'communications:delivery:read', 'billing:read'];
    auth.activeModules = ['billing'];
    auth.forceNotifications = false;
    auth.queryMode = 'detailError';

    const html = renderToStaticMarkup(createElement(CommunicationCenterPage));

    expect(html).toContain('Reintentar mensaje');
  });
});

describe('EntityTimeline', () => {
  it('does not expose the invoice timeline without billing read permission', () => {
    auth.permissions = ['communications:access', 'communications:delivery:read'];
    auth.activeModules = ['billing'];

    const html = renderToStaticMarkup(createElement(EntityTimeline, {
      entityType: 'INVOICE',
      entityId: 'invoice-1',
    }));

    expect(html).toBe('');
  });

  it('offers a retry action when timeline settings fail to load', () => {
    auth.permissions = ['communications:access', 'communications:delivery:read', 'billing:read'];
    auth.activeModules = ['billing'];

    const html = renderToStaticMarkup(createElement(EntityTimeline, {
      entityType: 'INVOICE',
      entityId: 'invoice-1',
    }));

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<button[^>]*>[^<]*Reintentar/);
  });
});

describe('Communications navigation and cache scope', () => {
  it('offers message navigation from a notification to a user allowed to read deliveries', () => {
    auth.permissions = ['communications:access', 'communications:delivery:read', 'billing:read'];
    auth.activeModules = ['billing'];
    auth.forceNotifications = true;
    auth.queryMode = 'notifications';

    const html = renderToStaticMarkup(createElement(CommunicationCenterPage));

    expect(html).toContain('Entrega fallida');
    expect(html).toMatch(/<button[^>]*>Ver entrega<\/button>/);
  });

  it('scopes settings, identity, template, and timeline queries to the signed-in user', () => {
    auth.permissions = ['communications:access', 'communications:settings:manage', 'communications:delivery:read', 'billing:read'];
    auth.activeModules = ['billing'];
    auth.forceNotifications = false;
    auth.queryMode = 'cache';
    auth.queryKeys = [];

    renderToStaticMarkup(createElement(CommunicationCenterPage));
    renderToStaticMarkup(createElement(CommunicationConfiguration, {
      settings: { enabled: true, emailEnabled: true, invoiceEmailEnabled: false },
    }));
    renderToStaticMarkup(createElement(EntityTimeline, { entityType: 'INVOICE', entityId: 'invoice-1' }));

    expect(auth.queryKeys).toContainEqual(['communications', 'tenant-1', 'user-1', 'settings']);
    expect(auth.queryKeys).toContainEqual(['communications', 'tenant-1', 'user-1', 'identities']);
    expect(auth.queryKeys).toContainEqual(['communications', 'tenant-1', 'user-1', 'templates']);
    expect(auth.queryKeys).toContainEqual(['communication-timeline', 'tenant-1', 'user-1', 'INVOICE', 'invoice-1', 1]);
  });
});

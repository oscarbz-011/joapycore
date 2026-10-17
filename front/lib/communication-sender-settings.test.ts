import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunicationSender } from './api/communications';
import { CommunicationConfiguration } from '@/components/communications/communication-settings';

const state = vi.hoisted(() => ({
  sender: { via: 'none' } as Record<string, unknown>,
  senderFails: false,
}));

beforeEach(() => {
  state.sender = { via: 'none' };
  state.senderFails = false;
});

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    jwtPayload: {
      sub: 'user-1',
      tenantId: 'tenant-1',
      permissions: ['communications:access', 'communications:settings:manage'],
      activeModules: [],
    },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const isSender = queryKey.includes('sender');
    const failed = isSender && state.senderFails;
    return {
      isPending: false,
      error: failed ? new Error('Unavailable') : null,
      data: failed ? undefined : isSender ? state.sender : [],
      refetch: () => Promise.resolve(),
    };
  },
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ error: null, isPending: false, isSuccess: false, mutate: () => undefined }),
}));

const configuration = (sender?: CommunicationSender) => {
  if (sender) state.sender = sender;
  return renderToStaticMarkup(
    createElement(CommunicationConfiguration, {
      settings: { enabled: true, emailEnabled: true, invoiceEmailEnabled: false },
    }),
  );
};

describe('where invoices go out from, in the settings', () => {
  // Sin correo propio la empresa no tiene que crear nada para enviar.
  it('tells a company without its own email that the platform sends for it, and asks for no identity', () => {
    const html = configuration({
      via: 'platform',
      fromEmail: 'ferro-sa@correo.joapycore.com',
      fromName: 'Ferro SA vía JoapyCore',
      replyTo: 'ventas@ferro.com',
    });

    expect(html).toContain('las facturas salen igual');
    expect(html).toContain('ferro-sa@correo.joapycore.com');
    expect(html).toContain('Las respuestas llegan a ventas@ferro.com.');
    expect(html).not.toContain('Nueva identidad');
    expect(html).not.toContain('No hay identidades');
  });

  it('offers an identity once the company connected its email', () => {
    const html = configuration({
      via: 'smtp',
      fromEmail: 'ventas@ferro.com',
      fromName: null,
      replyTo: null,
    });

    expect(html).toContain('identidad es opcional');
    expect(html).toMatch(/<button[^>]*>Nueva identidad<\/button>/);
  });

  it('warns when nothing can go out', () => {
    const html = configuration();

    expect(html).toContain('role="alert"');
    expect(html).toContain('Los correos no pueden salir todavía');
    expect(html).not.toContain('Nueva identidad');
  });

  it('offers a retry when it cannot tell where they go out from', () => {
    state.senderFails = true;

    expect(configuration()).toContain('Reintentar remitente');
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPage from '@/app/(dashboard)/dashboard/chat/page';
import { WS_EVENT_MAP } from './ws-event-map';

const state = vi.hoisted(() => ({
  search: '',
  fails: null as string | null,
  empty: false,
  queryKeys: [] as unknown[][],
}));

beforeEach(() => {
  state.search = '';
  state.fails = null;
  state.empty = false;
  state.queryKeys = [];
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    jwtPayload: { sub: 'me', tenantId: 'tenant-1', permissions: [], activeModules: [] },
  }),
}));

const me = { id: 'me', firstName: 'Juan', lastName: 'Benítez' };
const ana = { id: 'ana', firstName: 'Ana', lastName: 'López' };
const luis = { id: 'luis', firstName: 'Luis', lastName: 'Rojas' };
const CONVERSATIONS = [
  {
    id: 'c1',
    kind: 'DIRECT',
    name: null,
    unread: 2,
    lastMessageAt: '2026-10-13T14:05:00.000Z',
    createdAt: '2026-10-13T12:00:00.000Z',
    participants: [me, ana],
    lastMessage: { id: 'm2', conversationId: 'c1', senderId: 'ana', body: '¿Viste la factura?', createdAt: '2026-10-13T14:05:00.000Z' },
  },
  {
    id: 'c2',
    kind: 'GROUP',
    name: 'Cobranzas',
    unread: 0,
    lastMessageAt: null,
    createdAt: '2026-10-12T12:00:00.000Z',
    participants: [me, ana, luis],
    lastMessage: null,
  },
];
const MESSAGES = {
  items: [
    { id: 'm2', conversationId: 'c1', senderId: 'ana', body: '¿Viste la factura?', createdAt: '2026-10-13T14:05:00.000Z' },
    { id: 'm1', conversationId: 'c1', senderId: 'me', body: 'Hola Ana', createdAt: '2026-10-13T14:00:00.000Z' },
  ],
  hasMore: true,
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    state.queryKeys.push(queryKey);
    const failed = state.fails !== null && queryKey.includes(state.fails);
    const data = queryKey.includes('conversations')
      ? state.empty ? [] : CONVERSATIONS
      : queryKey.includes('messages')
        ? MESSAGES
        : queryKey.includes('people')
          ? [ana, luis]
          : { unread: 2 };
    return {
      isPending: false,
      error: failed ? new Error('Unavailable') : null,
      data: failed ? undefined : data,
      refetch: () => Promise.resolve(),
    };
  },
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ error: null, isPending: false, mutate: () => undefined }),
}));

const page = () => renderToStaticMarkup(createElement(ChatPage));

describe('Chat', () => {
  it('lists the conversations with who they are with, the last message and what is unread', () => {
    const html = page();

    expect(html).toContain('Ana López');
    expect(html).toContain('¿Viste la factura?');
    expect(html).toContain('aria-label="2 sin leer"');
    expect(html).toContain('Cobranzas');
    expect(html).toContain('Sin mensajes todavía');
    expect(html).toContain('Elegí una conversación');
  });

  it('opens the conversation named in the link, oldest message first', () => {
    state.search = 'c=c1';

    const html = page();

    expect(html.indexOf('Hola Ana')).toBeGreaterThan(-1);
    expect(html.indexOf('Hola Ana')).toBeLessThan(html.lastIndexOf('¿Viste la factura?'));
    expect(html).toContain('aria-label="Enviar mensaje"');
    expect(html).toMatch(/<button[^>]*>Ver mensajes anteriores<\/button>/);
  });

  it('names the members of a group', () => {
    state.search = 'c=c2';

    expect(page()).toContain('Vos, Ana López, Luis Rojas');
  });

  it('invites to start a chat when there are no conversations', () => {
    state.empty = true;

    expect(page()).toContain('Empezá un chat con un compañero');
  });

  it('offers a retry when the conversations fail to load', () => {
    state.fails = 'conversations';

    const html = page();

    expect(html).toContain('role="alert"');
    expect(html).toContain('Reintentar conversaciones');
  });

  it('offers a retry when the messages fail to load', () => {
    state.search = 'c=c1';
    state.fails = 'messages';

    expect(page()).toContain('Reintentar mensajes');
  });

  it('scopes every query to the signed-in user', () => {
    state.search = 'c=c1';

    page();

    expect(state.queryKeys).toContainEqual(['chat', 'tenant-1', 'me', 'conversations']);
    expect(state.queryKeys).toContainEqual(['chat', 'tenant-1', 'me', 'messages', 'c1']);
  });
});

describe('real-time refresh', () => {
  it.each(['chat.message', 'chat.conversation', 'chat.read'])('%s refreshes the chat queries', (event) => {
    expect(WS_EVENT_MAP[event]).toEqual([['chat']]);
  });
});

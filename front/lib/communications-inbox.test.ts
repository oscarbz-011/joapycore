import { describe, expect, it } from 'vitest';
import type { AccountsReceivable } from './api/payments';
import type { Conversation, ThreadItem } from './api/communications';
import {
  attentionCount,
  attentionItems,
  contactBalance,
  conversationPreview,
  deliveryState,
  inboxHref,
  initials,
  parseSelection,
  threadByDay,
} from './communications-inbox';

const BASE = '/dashboard/communications';

describe('what is open in the inbox', () => {
  it('opens the customers box when the link says nothing', () => {
    expect(parseSelection(new URLSearchParams(''))).toEqual({ box: 'customers', contactId: null });
  });

  it('reads the box and the contact from the link', () => {
    expect(parseSelection(new URLSearchParams('box=problems&contact=c1'))).toEqual({
      box: 'problems',
      contactId: 'c1',
    });
  });

  it('ignores a box that does not exist', () => {
    expect(parseSelection(new URLSearchParams('box=spam')).box).toBe('customers');
  });

  it('writes a link that reads back the same', () => {
    const selection = { box: 'problems' as const, contactId: 'c1' };
    const href = inboxHref(BASE, selection);
    expect(href).toBe('/dashboard/communications?box=problems&contact=c1');
    expect(parseSelection(new URLSearchParams(href.split('?')[1]))).toEqual(selection);
    expect(inboxHref(BASE, { box: 'customers', contactId: null })).toBe(BASE);
  });
});

describe('deliveryState', () => {
  it('says in plain words what happened with an email', () => {
    expect(deliveryState('SENT')).toMatchObject({ label: 'Enviado', tone: 'ok' });
    expect(deliveryState('QUEUED').tone).toBe('pending');
    expect(deliveryState('PROCESSING').tone).toBe('pending');
    expect(deliveryState('FAILED')).toMatchObject({ label: 'No se pudo enviar', tone: 'problem' });
  });

  // No se puede reenviar sin revisar: pudo haber salido.
  it('treats an unconfirmed email as a problem and says to check first', () => {
    const state = deliveryState('UNKNOWN');
    expect(state.tone).toBe('problem');
    expect(state.hint).toMatch(/antes de volver a enviarlo/);
  });
});

describe('initials', () => {
  it('takes the first and the last word of a name', () => {
    expect(initials('María Elena López Ruiz')).toBe('MR');
    expect(initials('  pedro ')).toBe('P');
    expect(initials('')).toBe('?');
  });
});

const conversation = (lastMessage: Conversation['lastMessage']): Conversation => ({
  contact: { type: 'CUSTOMER', id: 'c1', code: null, name: 'María López', email: null, phone: null },
  messages: lastMessage ? 1 : 0,
  notes: 1,
  problems: 0,
  lastAt: '2026-10-10T14:00:00.000Z',
  lastMessage,
});
const last = (status: NonNullable<Conversation['lastMessage']>['status']) => ({
  id: 'm1',
  subject: 'Factura 001',
  status,
  createdAt: '2026-10-10T14:00:00.000Z',
});

describe('conversationPreview', () => {
  it('shows the subject of the last email', () => {
    expect(conversationPreview(conversation(last('SENT')))).toBe('Factura 001');
  });

  it('puts the problem first when the last email did not go out', () => {
    expect(conversationPreview(conversation(last('FAILED')))).toBe('No se pudo enviar · Factura 001');
  });

  it('names a conversation that only has internal notes', () => {
    expect(conversationPreview(conversation(null))).toBe('Nota interna');
  });
});

describe('threadByDay', () => {
  const item = (id: string, createdAt: string): ThreadItem => ({
    kind: 'NOTE',
    id,
    entityType: 'CUSTOMER',
    entityId: 'c1',
    body: id,
    createdAt,
    author: null,
  });

  it('reads oldest first, grouped by day', () => {
    const days = threadByDay([
      item('c', '2026-10-11T13:00:00.000Z'),
      item('b', '2026-10-10T18:00:00.000Z'),
      item('a', '2026-10-10T12:00:00.000Z'),
    ]);

    expect(days.map((day) => [day.day, day.items.map((i) => i.id)])).toEqual([
      ['10 de octubre de 2026', ['a', 'b']],
      ['11 de octubre de 2026', ['c']],
    ]);
  });

  // 02:00 UTC del 11 todavía es el 10 a la noche en Paraguay.
  it('uses the day in Paraguay, not in UTC', () => {
    expect(threadByDay([item('a', '2026-10-11T02:00:00.000Z')])[0].day).toBe('10 de octubre de 2026');
  });

  it('is empty for an empty thread', () => {
    expect(threadByDay([])).toEqual([]);
  });
});

describe('attentionCount', () => {
  it('adds the conversations with problems and the unread notices', () => {
    expect(attentionCount({ problemConversations: 2, problemMessages: 5 }, 3)).toBe(5);
    expect(attentionCount(undefined, undefined)).toBe(0);
  });
});

describe('attentionItems', () => {
  it('is one line per kind, each opening its box', () => {
    expect(attentionItems(BASE, 2, 1).map((item) => [item.type, item.title, item.href])).toEqual([
      ['communication-problem', '2 clientes tienen correos sin enviar', '/dashboard/communications?box=problems'],
      ['communication-notice', 'Un aviso sin leer', '/dashboard/communications?box=notices'],
    ]);
  });

  it('says nothing when nothing is waiting', () => {
    expect(attentionItems(BASE, 0, 0)).toEqual([]);
  });
});

describe('contactBalance', () => {
  const receivable = (
    id: string,
    customerId: string,
    overrides: Partial<AccountsReceivable> = {},
  ): AccountsReceivable =>
    ({
      id,
      amount: 100,
      paidAmount: 0,
      status: 'PENDING',
      dueDate: '2099-01-01T00:00:00.000Z',
      invoice: { saleOrder: { saleType: 'CASH', customer: { id: customerId }, loan: null } },
      ...overrides,
    }) as AccountsReceivable;

  it('adds what the customer still owes and leaves out other customers and paid accounts', () => {
    const balance = contactBalance(
      [
        receivable('a', 'c1', { amount: 300, paidAmount: 100 }),
        receivable('b', 'c1', { status: 'PAID' }),
        receivable('c', 'c2'),
      ],
      'c1',
    );

    expect(balance).toEqual({ open: 1, balance: 200, overdue: 0, receivableId: 'a' });
  });

  it('points at the overdue account first', () => {
    const balance = contactBalance(
      [receivable('a', 'c1'), receivable('b', 'c1', { dueDate: '2020-01-01T00:00:00.000Z' })],
      'c1',
    );

    expect(balance).toMatchObject({ open: 2, overdue: 1, receivableId: 'b' });
  });

  it('is empty for a customer with nothing to collect', () => {
    expect(contactBalance([], 'c1')).toEqual({ open: 0, balance: 0, overdue: 0, receivableId: null });
  });
});

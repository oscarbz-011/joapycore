import { describe, expect, it } from 'vitest';
import type { ChatConversation, ChatMessage } from './api/chat';
import {
  conversationPreview,
  conversationTitle,
  dayLabel,
  initials,
  listTime,
  matchesSearch,
  mergeMessages,
  threadDays,
} from './chat';

// Mediodía en Paraguay del 13/10/2026.
const NOW = new Date('2026-10-13T15:00:00.000Z');
const me = { id: 'me', firstName: 'Juan', lastName: 'Benítez' };
const ana = { id: 'ana', firstName: 'Ana', lastName: 'López' };
const luis = { id: 'luis', firstName: 'Luis', lastName: 'Rojas' };

const message = (id: string, senderId: string, createdAt: string, body = id): ChatMessage => ({
  id,
  conversationId: 'c1',
  senderId,
  body,
  createdAt,
});
const conversation = (overrides: Partial<ChatConversation> = {}): ChatConversation => ({
  id: 'c1',
  kind: 'DIRECT',
  name: null,
  unread: 0,
  lastMessageAt: null,
  createdAt: '2026-10-13T12:00:00.000Z',
  participants: [me, ana],
  lastMessage: null,
  ...overrides,
});

describe('conversationTitle', () => {
  it('is the other person in a direct conversation', () => {
    expect(conversationTitle(conversation(), 'me')).toBe('Ana López');
  });

  it('is the name of the group', () => {
    expect(
      conversationTitle(conversation({ kind: 'GROUP', name: 'Cobranzas', participants: [me, ana, luis] }), 'me'),
    ).toBe('Cobranzas');
  });
});

describe('conversationPreview', () => {
  it('says so when nobody wrote yet', () => {
    expect(conversationPreview(conversation(), 'me')).toBe('Sin mensajes todavía');
  });

  it('marks what the user wrote', () => {
    const last = message('m1', 'me', '2026-10-13T14:00:00.000Z', 'Te paso\nla factura');
    expect(conversationPreview(conversation({ lastMessage: last }), 'me')).toBe('Vos: Te paso la factura');
  });

  it('shows what the other person wrote as it is', () => {
    const last = message('m1', 'ana', '2026-10-13T14:00:00.000Z', 'Dale');
    expect(conversationPreview(conversation({ lastMessage: last }), 'me')).toBe('Dale');
  });

  it('says who wrote in a group', () => {
    const last = message('m1', 'luis', '2026-10-13T14:00:00.000Z', 'Reunión a las 10');
    expect(
      conversationPreview(conversation({ kind: 'GROUP', name: 'Cobranzas', participants: [me, ana, luis], lastMessage: last }), 'me'),
    ).toBe('Luis: Reunión a las 10');
  });
});

describe('dates', () => {
  it('shows the time for today and the date for another day', () => {
    expect(listTime('2026-10-13T13:20:00.000Z', NOW)).toBe('10:20');
    expect(listTime('2026-10-11T13:20:00.000Z', NOW)).toBe('11/10');
  });

  it('names today and yesterday', () => {
    expect(dayLabel('2026-10-13T13:20:00.000Z', NOW)).toBe('Hoy');
    expect(dayLabel('2026-10-12T13:20:00.000Z', NOW)).toBe('Ayer');
    expect(dayLabel('2026-10-05T13:20:00.000Z', NOW)).toBe('5 de octubre de 2026');
  });

  // 02:00 UTC del 13 todavía es el 12 a la noche en Paraguay.
  it('uses the day in Paraguay, not in UTC', () => {
    expect(dayLabel('2026-10-13T02:00:00.000Z', NOW)).toBe('Ayer');
  });
});

describe('threadDays', () => {
  const newestFirst = [
    message('d', 'me', '2026-10-13T14:10:00.000Z'),
    message('c', 'ana', '2026-10-13T14:05:00.000Z'),
    message('b', 'ana', '2026-10-13T14:00:00.000Z'),
    message('a', 'me', '2026-10-12T20:00:00.000Z'),
  ];

  it('reads oldest first, by day', () => {
    const days = threadDays(newestFirst, [me, ana], 'me', NOW);

    expect(days.map((day) => [day.day, day.messages.map((item) => item.id)])).toEqual([
      ['Ayer', ['a']],
      ['Hoy', ['b', 'c', 'd']],
    ]);
  });

  it('tells whose each message is and where a run by the same person starts', () => {
    const [, today] = threadDays(newestFirst, [me, ana], 'me', NOW);

    expect(today.messages.map((item) => [item.id, item.mine, item.startsRun, item.senderName])).toEqual([
      ['b', false, true, 'Ana López'],
      ['c', false, false, 'Ana López'],
      ['d', true, true, 'Juan Benítez'],
    ]);
  });

  it('starts a new run on a new day even for the same person', () => {
    const days = threadDays(
      [message('b', 'ana', '2026-10-13T14:00:00.000Z'), message('a', 'ana', '2026-10-12T20:00:00.000Z')],
      [me, ana],
      'me',
      NOW,
    );

    expect(days.map((day) => day.messages[0].startsRun)).toEqual([true, true]);
  });
});

describe('matchesSearch', () => {
  it('ignores accents and capitals, and needs every word', () => {
    expect(matchesSearch('Ana López', 'lopez')).toBe(true);
    expect(matchesSearch('Ana López', 'LÓPEZ ana')).toBe(true);
    expect(matchesSearch('Ana López', 'ana rojas')).toBe(false);
    expect(matchesSearch('Ana López', '')).toBe(true);
  });
});

describe('mergeMessages', () => {
  it('joins pages without repeating a message, newest first', () => {
    const latest = [message('c', 'ana', '2026-10-13T14:05:00.000Z'), message('b', 'ana', '2026-10-13T14:00:00.000Z')];
    const older = [message('b', 'ana', '2026-10-13T14:00:00.000Z'), message('a', 'me', '2026-10-12T20:00:00.000Z')];

    expect(mergeMessages(latest, older).map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('initials', () => {
  it('takes the first and the last word of a name', () => {
    expect(initials('Ana María López')).toBe('AL');
    expect(initials(' cobranzas ')).toBe('C');
    expect(initials('')).toBe('?');
  });
});

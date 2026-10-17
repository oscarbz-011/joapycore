import type { ChatConversation, ChatMessage, ChatPerson } from './api/chat';

const ZONE = 'America/Asuncion';

export const personName = (person: ChatPerson) => `${person.firstName} ${person.lastName}`.trim();

/** Con quién es: el nombre del grupo, o la otra persona. */
export function conversationTitle(conversation: ChatConversation, meId: string | undefined): string {
  if (conversation.kind === 'GROUP') return conversation.name || 'Grupo';
  const other = conversation.participants.find((person) => person.id !== meId);
  return other ? personName(other) : 'Conversación';
}

export function conversationPreview(conversation: ChatConversation, meId: string | undefined): string {
  const last = conversation.lastMessage;
  if (!last) return 'Sin mensajes todavía';
  const body = last.body.replace(/\s+/g, ' ');
  if (last.senderId === meId) return `Vos: ${body}`;
  if (conversation.kind !== 'GROUP') return body;
  const sender = conversation.participants.find((person) => person.id === last.senderId);
  return sender ? `${sender.firstName}: ${body}` : body;
}

const dayKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const TIME = new Intl.DateTimeFormat('es-PY', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
const SHORT_DATE = new Intl.DateTimeFormat('es-PY', { timeZone: ZONE, day: '2-digit', month: '2-digit' });
const LONG_DATE = new Intl.DateTimeFormat('es-PY', { timeZone: ZONE, day: 'numeric', month: 'long', year: 'numeric' });

export const messageTime = (iso: string) => TIME.format(new Date(iso));

/** En la lista: la hora si fue hoy, la fecha si no. */
export function listTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return dayKey(date) === dayKey(now) ? TIME.format(date) : SHORT_DATE.format(date);
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (dayKey(date) === dayKey(now)) return 'Hoy';
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(date) === dayKey(yesterday)) return 'Ayer';
  return LONG_DATE.format(date);
}

export interface ThreadMessage extends ChatMessage {
  mine: boolean;
  /** Primer mensaje de una seguidilla de la misma persona: ahí va el nombre. */
  startsRun: boolean;
  senderName: string;
}
export interface ThreadDay {
  day: string;
  messages: ThreadMessage[];
}

/** Los mensajes llegan del más nuevo al más viejo; se leen al revés, por día. */
export function threadDays(
  messages: ChatMessage[],
  participants: ChatPerson[],
  meId: string | undefined,
  now: Date = new Date(),
): ThreadDay[] {
  const names = new Map(participants.map((person) => [person.id, personName(person)]));
  const days: ThreadDay[] = [];
  let previous: ChatMessage | null = null;
  for (const message of [...messages].reverse()) {
    const day = dayLabel(message.createdAt, now);
    let current = days[days.length - 1];
    if (current?.day !== day) {
      current = { day, messages: [] };
      days.push(current);
      previous = null;
    }
    current.messages.push({
      ...message,
      mine: message.senderId === meId,
      startsRun: previous?.senderId !== message.senderId,
      senderName: names.get(message.senderId) ?? 'Usuario',
    });
    previous = message;
  }
  return days;
}

const plain = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Sin distinguir acentos ni mayúsculas. */
export function matchesSearch(text: string, term: string): boolean {
  const words = plain(term).split(/\s+/).filter(Boolean);
  const haystack = plain(text);
  return words.every((word) => haystack.includes(word));
}

/** Las páginas viejas y la más nueva pueden pisarse cuando llega un mensaje. */
export function mergeMessages(...pages: ChatMessage[][]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of pages.flat()) byId.set(message.id, message);
  return [...byId.values()].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return picked.map((word) => word[0].toUpperCase()).join('');
}

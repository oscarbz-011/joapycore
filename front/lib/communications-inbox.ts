import type { AccountsReceivable } from './api/payments';
import type {
  Conversation,
  ConversationsSummary,
  DeliveryStatus,
  ThreadItem,
} from './api/communications';
import { arUrgency } from './ar-urgency';
import type { PendingNotification } from './use-pending-notifications';

export type BoxId = 'customers' | 'problems' | 'notices';

export const BOXES: { id: BoxId; label: string; section: string }[] = [
  { id: 'customers', label: 'Clientes', section: 'Externa' },
  { id: 'problems', label: 'Con problemas', section: 'Externa' },
  { id: 'notices', label: 'Mis avisos', section: 'Para mí' },
];

export interface Selection {
  box: BoxId;
  contactId: string | null;
}

export function parseSelection(params: { get(name: string): string | null }): Selection {
  const box = params.get('box');
  return {
    box: BOXES.some((item) => item.id === box) ? (box as BoxId) : 'customers',
    contactId: params.get('contact'),
  };
}

export function inboxHref(base: string, selection: Selection): string {
  const params = new URLSearchParams();
  if (selection.box !== 'customers') params.set('box', selection.box);
  if (selection.contactId) params.set('contact', selection.contactId);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export type DeliveryTone = 'ok' | 'pending' | 'problem';

export interface DeliveryState {
  label: string;
  tone: DeliveryTone;
  hint?: string;
}

const DELIVERY: Record<DeliveryStatus, DeliveryState> = {
  QUEUED: { label: 'En cola de envío', tone: 'pending' },
  PROCESSING: { label: 'Enviando', tone: 'pending' },
  SENT: {
    label: 'Enviado',
    tone: 'ok',
    hint: 'El servidor de correo lo aceptó. No confirma que el cliente lo haya leído.',
  },
  FAILED: { label: 'No se pudo enviar', tone: 'problem' },
  UNKNOWN: {
    label: 'Sin confirmar',
    tone: 'problem',
    hint: 'No se sabe si el correo salió. Revisá con tu proveedor de correo antes de volver a enviarlo.',
  },
};

export function deliveryState(status: DeliveryStatus): DeliveryState {
  return DELIVERY[status] ?? { label: status, tone: 'pending' };
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return picked.map((word) => word[0].toUpperCase()).join('');
}

export function conversationPreview(conversation: Conversation): string {
  const last = conversation.lastMessage;
  if (!last) return 'Nota interna';
  const state = deliveryState(last.status);
  return state.tone === 'problem' ? `${state.label} · ${last.subject}` : last.subject;
}

const DAY = new Intl.DateTimeFormat('es-PY', {
  timeZone: 'America/Asuncion',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export interface ThreadDay {
  day: string;
  items: ThreadItem[];
}

/** El hilo llega del más nuevo al más viejo; se lee al revés, separado por día. */
export function threadByDay(items: ThreadItem[]): ThreadDay[] {
  const days: ThreadDay[] = [];
  for (const item of [...items].reverse()) {
    const day = DAY.format(new Date(item.createdAt));
    const current = days[days.length - 1];
    if (current?.day === day) current.items.push(item);
    else days.push({ day, items: [item] });
  }
  return days;
}

export function attentionCount(
  summary: ConversationsSummary | undefined,
  unreadNotices: number | undefined,
): number {
  return (summary?.problemConversations ?? 0) + (unreadNotices ?? 0);
}

/** Lo que la campana muestra de Comunicaciones: una línea por tipo, no una por correo. */
export function attentionItems(base: string, problems: number, unreadNotices: number): PendingNotification[] {
  const items: PendingNotification[] = [];
  if (problems > 0) {
    items.push({
      id: 'communication-problems',
      type: 'communication-problem',
      title: problems === 1 ? 'Un cliente tiene correos sin enviar' : `${problems} clientes tienen correos sin enviar`,
      description: 'Revisá qué pasó y reintentá el envío',
      href: inboxHref(base, { box: 'problems', contactId: null }),
    });
  }
  if (unreadNotices > 0) {
    items.push({
      id: 'communication-notices',
      type: 'communication-notice',
      title: unreadNotices === 1 ? 'Un aviso sin leer' : `${unreadNotices} avisos sin leer`,
      description: 'Sobre los correos que pediste enviar',
      href: inboxHref(base, { box: 'notices', contactId: null }),
    });
  }
  return items;
}

export interface ContactBalance {
  open: number;
  balance: number;
  overdue: number;
  /** La cuenta a abrir para cobrar: la más urgente. */
  receivableId: string | null;
}

export function contactBalance(receivables: AccountsReceivable[], customerId: string): ContactBalance {
  const open = receivables.filter(
    (ar) =>
      ar.invoice.saleOrder.customer.id === customerId &&
      ar.status !== 'PAID' &&
      ar.status !== 'CANCELLED',
  );
  const overdue = open.filter((ar) => arUrgency(ar).level === 'overdue');
  return {
    open: open.length,
    balance: open.reduce((total, ar) => total + (Number(ar.amount) - Number(ar.paidAmount)), 0),
    overdue: overdue.length,
    receivableId: (overdue[0] ?? open[0])?.id ?? null,
  };
}

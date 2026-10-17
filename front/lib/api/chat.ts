import { apiClient } from './client';

export interface ChatPerson {
  id: string;
  firstName: string;
  lastName: string;
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}
export interface ChatConversation {
  id: string;
  kind: 'DIRECT' | 'GROUP';
  name: string | null;
  unread: number;
  lastMessageAt: string | null;
  createdAt: string;
  participants: ChatPerson[];
  lastMessage: ChatMessage | null;
}
export interface ChatMessagesPage {
  /** Del más nuevo al más viejo. */
  items: ChatMessage[];
  hasMore: boolean;
}

export const chatApi = {
  people: (): Promise<ChatPerson[]> => apiClient.get('/chat/people').then((r) => r.data),
  unread: (): Promise<{ unread: number }> => apiClient.get('/chat/unread').then((r) => r.data),
  conversations: (): Promise<ChatConversation[]> =>
    apiClient.get('/chat/conversations').then((r) => r.data),
  open: (participantIds: string[], name?: string): Promise<ChatConversation> =>
    apiClient.post('/chat/conversations', { participantIds, name: name || undefined }).then((r) => r.data),
  messages: (conversationId: string, before?: string): Promise<ChatMessagesPage> =>
    apiClient
      .get(`/chat/conversations/${conversationId}/messages`, { params: { limit: 50, before } })
      .then((r) => r.data),
  send: (conversationId: string, body: string): Promise<ChatMessage> =>
    apiClient.post(`/chat/conversations/${conversationId}/messages`, { body }).then((r) => r.data),
  markRead: (conversationId: string): Promise<void> =>
    apiClient.post(`/chat/conversations/${conversationId}/read`).then(() => undefined),
};

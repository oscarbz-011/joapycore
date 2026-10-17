import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsGateway } from '../notifications/gateway/notifications.gateway';
import { ChatRepository, ConversationRow } from './chat.repository';
import {
  MessagesQueryDto,
  OpenConversationDto,
  SendMessageDto,
} from './chat.dto';

/** La misma clave sin importar quién de los dos abre la conversación. */
export function directKeyOf(a: string, b: string): string {
  return [a, b].sort().join(':');
}

@Injectable()
export class ChatService {
  constructor(
    private readonly repository: ChatRepository,
    private readonly gateway: NotificationsGateway,
  ) {}

  people(tenantId: string, userId: string) {
    return this.repository.people(tenantId, userId);
  }

  async conversations(tenantId: string, userId: string) {
    return this.describe(
      tenantId,
      await this.repository.conversationsOf(tenantId, userId),
    );
  }

  async unread(tenantId: string, userId: string) {
    return { unread: await this.repository.unreadTotal(tenantId, userId) };
  }

  async open(tenantId: string, userId: string, dto: OpenConversationDto) {
    const others = dto.participantIds.filter((id) => id !== userId);
    if (others.length === 0) {
      throw new BadRequestException('Elegí al menos a otra persona.');
    }
    const found = await this.repository.activeUsers(tenantId, others);
    if (found.length !== others.length) {
      throw new BadRequestException(
        'Alguna de las personas elegidas ya no está disponible.',
      );
    }
    const isDirect = others.length === 1;
    if (!isDirect && !dto.name) {
      throw new BadRequestException('Poné un nombre al grupo.');
    }
    const directKey = isDirect ? directKeyOf(userId, others[0]) : null;
    const existing = directKey
      ? await this.repository.directByKey(tenantId, directKey)
      : null;
    const conversation =
      existing ??
      (await this.repository.createConversation({
        tenantId,
        kind: isDirect ? 'DIRECT' : 'GROUP',
        name: isDirect ? null : (dto.name ?? null),
        directKey,
        createdBy: userId,
        participantIds: [userId, ...others],
      }));
    if (!existing) {
      this.notify(tenantId, [userId, ...others], 'chat.conversation', {
        conversationId: conversation.id,
      });
    }
    const [described] = await this.describe(
      tenantId,
      await this.repository.conversationsOf(tenantId, userId, conversation.id),
    );
    return described;
  }

  async messages(
    tenantId: string,
    userId: string,
    conversationId: string,
    query: MessagesQueryDto,
  ) {
    await this.requireParticipant(tenantId, conversationId, userId);
    const items = await this.repository.messages(
      tenantId,
      conversationId,
      query.before ? new Date(query.before) : undefined,
      query.limit,
    );
    return { items, hasMore: items.length === query.limit };
  }

  async send(
    tenantId: string,
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    await this.requireParticipant(tenantId, conversationId, userId);
    const message = await this.repository.createMessage({
      tenantId,
      conversationId,
      senderId: userId,
      body: dto.body,
    });
    const participants = await this.repository.participants(tenantId, [
      conversationId,
    ]);
    // Solo el aviso: el contenido se lee por REST, donde se verifica el acceso.
    this.notify(
      tenantId,
      participants.map((participant) => participant.userId),
      'chat.message',
      { conversationId },
    );
    return message;
  }

  async markRead(tenantId: string, userId: string, conversationId: string) {
    await this.requireParticipant(tenantId, conversationId, userId);
    await this.repository.markRead(tenantId, conversationId, userId);
    this.notify(tenantId, [userId], 'chat.read', { conversationId });
    return { read: true };
  }

  // 404 y no 403: no se confirma que exista una conversación ajena.
  private async requireParticipant(
    tenantId: string,
    conversationId: string,
    userId: string,
  ) {
    const participant = await this.repository.participant(
      tenantId,
      conversationId,
      userId,
    );
    if (!participant) throw new NotFoundException('Conversación no encontrada');
  }

  private notify(
    tenantId: string,
    userIds: string[],
    event: string,
    payload: { conversationId: string },
  ) {
    for (const userId of new Set(userIds)) {
      this.gateway.emitToUser(tenantId, userId, event, payload);
    }
  }

  private async describe(tenantId: string, rows: ConversationRow[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [participants, lastMessages] = await Promise.all([
      this.repository.participants(tenantId, ids),
      this.repository.lastMessages(tenantId, ids),
    ]);
    const users = await this.repository.users(tenantId, [
      ...new Set(participants.map((participant) => participant.userId)),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const lastByConversation = new Map(
      lastMessages.map((message) => [message.conversationId, message]),
    );
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      unread: row.unread,
      lastMessageAt: row.lastMessageAt,
      createdAt: row.createdAt,
      participants: participants
        .filter((participant) => participant.conversationId === row.id)
        .flatMap((participant) => userById.get(participant.userId) ?? []),
      lastMessage: lastByConversation.get(row.id) ?? null,
    }));
  }
}

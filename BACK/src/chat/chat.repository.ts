import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ConversationKind = 'DIRECT' | 'GROUP';
export type ConversationRow = {
  id: string;
  kind: ConversationKind;
  name: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  unread: number;
};

const PERSON = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;
const MESSAGE = {
  id: true,
  conversationId: true,
  senderId: true,
  body: true,
  createdAt: true,
} satisfies Prisma.ChatMessageSelect;

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  people(tenantId: string, exceptUserId: string) {
    return this.prisma.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
        id: { not: exceptUserId },
      },
      select: PERSON,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      take: 500,
    });
  }

  activeUsers(tenantId: string, ids: string[]) {
    return this.prisma.user.findMany({
      where: { tenantId, status: 'ACTIVE', deletedAt: null, id: { in: ids } },
      select: PERSON,
    });
  }

  users(tenantId: string, ids: string[]) {
    return this.prisma.user.findMany({
      where: { tenantId, id: { in: ids } },
      select: PERSON,
    });
  }

  /** Las conversaciones del usuario, con lo que le falta leer de cada una. */
  conversationsOf(tenantId: string, userId: string, onlyId?: string) {
    return this.prisma.$queryRaw<ConversationRow[]>`
      SELECT c.id, c.kind, c.name,
             c.last_message_at AS "lastMessageAt", c.created_at AS "createdAt",
             (SELECT COUNT(*) FROM chat_messages m
               WHERE m.tenant_id = c.tenant_id AND m.conversation_id = c.id
                 AND m.sender_id <> ${userId}
                 AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at))::int AS unread
      FROM chat_participants p
      JOIN chat_conversations c ON c.id = p.conversation_id AND c.tenant_id = p.tenant_id
      WHERE p.tenant_id = ${tenantId} AND p.user_id = ${userId}
        AND (${onlyId ?? null}::text IS NULL OR c.id = ${onlyId ?? null})
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id
      LIMIT 200`;
  }

  async unreadTotal(tenantId: string, userId: string) {
    const [row] = await this.prisma.$queryRaw<[{ unread: number }]>`
      SELECT COUNT(*)::int AS unread
      FROM chat_participants p
      JOIN chat_messages m ON m.conversation_id = p.conversation_id AND m.tenant_id = p.tenant_id
      WHERE p.tenant_id = ${tenantId} AND p.user_id = ${userId}
        AND m.sender_id <> ${userId}
        AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)`;
    return row.unread;
  }

  participants(tenantId: string, conversationIds: string[]) {
    return this.prisma.chatParticipant.findMany({
      where: { tenantId, conversationId: { in: conversationIds } },
      select: { conversationId: true, userId: true, lastReadAt: true },
    });
  }

  participant(tenantId: string, conversationId: string, userId: string) {
    return this.prisma.chatParticipant.findFirst({
      where: { tenantId, conversationId, userId },
      select: { conversationId: true },
    });
  }

  lastMessages(tenantId: string, conversationIds: string[]) {
    return this.prisma.chatMessage.findMany({
      where: { tenantId, conversationId: { in: conversationIds } },
      distinct: ['conversationId'],
      orderBy: [
        { conversationId: 'asc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      select: MESSAGE,
    });
  }

  directByKey(tenantId: string, directKey: string) {
    return this.prisma.chatConversation.findUnique({
      where: { tenantId_directKey: { tenantId, directKey } },
      select: { id: true },
    });
  }

  async createConversation(input: {
    tenantId: string;
    kind: ConversationKind;
    name: string | null;
    directKey: string | null;
    createdBy: string;
    participantIds: string[];
  }) {
    const { participantIds, ...data } = input;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const conversation = await tx.chatConversation.create({
          data,
          select: { id: true },
        });
        await tx.chatParticipant.createMany({
          data: participantIds.map((userId) => ({
            conversationId: conversation.id,
            tenantId: input.tenantId,
            userId,
            // Quien la abre no tiene nada pendiente de leer.
            lastReadAt: userId === input.createdBy ? new Date() : null,
          })),
        });
        return conversation;
      });
    } catch (error) {
      // Los dos abrieron la misma conversación directa a la vez.
      if ((error as { code?: string }).code === 'P2002' && input.directKey) {
        const existing = await this.directByKey(
          input.tenantId,
          input.directKey,
        );
        if (existing) return existing;
      }
      throw error;
    }
  }

  messages(
    tenantId: string,
    conversationId: string,
    before: Date | undefined,
    limit: number,
  ) {
    return this.prisma.chatMessage.findMany({
      where: {
        tenantId,
        conversationId,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: MESSAGE,
    });
  }

  createMessage(input: {
    tenantId: string;
    conversationId: string;
    senderId: string;
    body: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.chatMessage.create({
        data: input,
        select: MESSAGE,
      });
      await tx.chatConversation.updateMany({
        where: { tenantId: input.tenantId, id: input.conversationId },
        data: { lastMessageAt: message.createdAt },
      });
      // Lo que uno mismo escribe queda leído.
      await tx.chatParticipant.updateMany({
        where: {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          userId: input.senderId,
        },
        data: { lastReadAt: message.createdAt },
      });
      return message;
    });
  }

  markRead(tenantId: string, conversationId: string, userId: string) {
    return this.prisma.chatParticipant.updateMany({
      where: { tenantId, conversationId, userId },
      data: { lastReadAt: new Date() },
    });
  }
}

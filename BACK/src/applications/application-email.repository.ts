import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { IncomingImapMessage } from '../integrations/imap-connection.service';

@Injectable()
export class ApplicationEmailRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.appEmailMessage.findMany({
      where: { tenantId },
      select: {
        id: true,
        recipient: true,
        subject: true,
        bodyText: true,
        status: true,
        sentAt: true,
        createdAt: true,
        sentBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  listInbox(tenantId: string, mailbox: string) {
    return this.prisma.appEmailInboxMessage.findMany({
      where: { tenantId, mailbox },
      select: {
        id: true,
        mailbox: true,
        messageId: true,
        senderName: true,
        senderEmail: true,
        recipients: true,
        subject: true,
        bodyText: true,
        receivedAt: true,
        isRead: true,
        starred: true,
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
  }

  async upsertInboxMessages(
    tenantId: string,
    mailbox: string,
    messages: IncomingImapMessage[],
  ) {
    if (!messages.length) return;
    await this.prisma.$transaction(
      messages.map((message) =>
        this.prisma.appEmailInboxMessage.upsert({
          where: {
            tenantId_mailbox_uid: { tenantId, mailbox, uid: message.uid },
          },
          create: { tenantId, mailbox, ...message },
          update: {
            messageId: message.messageId,
            senderName: message.senderName,
            senderEmail: message.senderEmail,
            recipients: message.recipients,
            subject: message.subject,
            bodyText: message.bodyText,
            receivedAt: message.receivedAt,
            isRead: message.isRead,
            starred: message.starred,
          },
        }),
      ),
    );
  }

  findById(tenantId: string, id: string) {
    return this.prisma.appEmailMessage.findFirst({
      where: { tenantId, id },
      select: {
        id: true,
        recipient: true,
        subject: true,
        bodyText: true,
        status: true,
        sentAt: true,
        createdAt: true,
        sentBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  createPending(
    tenantId: string,
    sentById: string,
    input: { recipient: string; subject: string; bodyText: string },
  ) {
    return this.prisma.appEmailMessage.create({
      data: { tenantId, sentById, ...input },
    });
  }

  markSent(tenantId: string, id: string) {
    return this.prisma.appEmailMessage.updateMany({
      where: { tenantId, id },
      data: { status: 'SENT', sentAt: new Date(), error: null },
    });
  }

  markFailed(tenantId: string, id: string, error: string) {
    return this.prisma.appEmailMessage.updateMany({
      where: { tenantId, id },
      data: { status: 'FAILED', error },
    });
  }
}

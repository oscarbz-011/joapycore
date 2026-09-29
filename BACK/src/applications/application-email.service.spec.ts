import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { ApplicationEmailRepository } from './application-email.repository';
import { ApplicationEmailService } from './application-email.service';

describe('ApplicationEmailService', () => {
  let service: ApplicationEmailService;
  let repository: {
    list: jest.Mock;
    listInbox: jest.Mock;
    syncInboxMessages: jest.Mock;
    findById: jest.Mock;
    createPending: jest.Mock;
    markSent: jest.Mock;
    markFailed: jest.Mock;
  };
  let emailService: {
    sendTenantText: jest.Mock;
    isTenantEmailEnabled: jest.Mock;
    getTenantEmailStatus: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let integrationsService: { getEnabledImapConfig: jest.Mock };
  let imapConnection: { fetchInbox: jest.Mock };

  beforeEach(() => {
    repository = {
      list: jest.fn().mockResolvedValue([]),
      listInbox: jest.fn().mockResolvedValue([]),
      syncInboxMessages: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'message-1',
        status: 'SENT',
      }),
      createPending: jest.fn().mockResolvedValue({
        id: 'message-1',
        recipient: 'client@example.com',
        subject: 'Hola',
        bodyText: 'Mensaje',
      }),
      markSent: jest.fn(),
      markFailed: jest.fn(),
    };
    emailService = {
      sendTenantText: jest.fn(),
      isTenantEmailEnabled: jest.fn().mockResolvedValue(true),
      getTenantEmailStatus: jest.fn().mockResolvedValue({
        enabled: true,
        outgoingEnabled: true,
        incomingEnabled: false,
        mailboxAddress: 'user@example.com',
        automaticSender: 'no-reply@example.com',
      }),
    };
    eventEmitter = { emit: jest.fn() };
    integrationsService = {
      getEnabledImapConfig: jest.fn().mockResolvedValue({
        host: 'imap.example.com',
        port: 993,
        secure: true,
        user: 'user@example.com',
        password: 'secret',
      }),
    };
    imapConnection = {
      fetchInbox: jest
        .fn()
        .mockResolvedValue({ uidValidity: '100', messages: [] }),
    };
    service = new ApplicationEmailService(
      repository as never,
      emailService as never,
      eventEmitter as never,
      integrationsService as never,
      imapConnection as never,
    );
  });

  it('reports whether the tenant integration is enabled', async () => {
    await expect(
      service.status('tenant-1', 'user@example.com'),
    ).resolves.toEqual({
      enabled: true,
      outgoingEnabled: true,
      incomingEnabled: false,
      mailboxAddress: 'user@example.com',
      automaticSender: 'no-reply@example.com',
    });
  });

  it('stores and sends a message with the tenant connection', async () => {
    await service.send('tenant-1', 'user-1', {
      to: 'CLIENT@EXAMPLE.COM',
      subject: ' Hola ',
      body: 'Mensaje',
    });

    expect(repository.createPending).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      expect.objectContaining({
        recipient: 'client@example.com',
        subject: 'Hola',
      }),
    );
    expect(emailService.sendTenantText).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        to: 'client@example.com',
      }),
    );
    expect(repository.markSent).toHaveBeenCalledWith('tenant-1', 'message-1');
    expect(repository.findById).toHaveBeenCalledWith('tenant-1', 'message-1');
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'application.email.sent',
      expect.objectContaining({ tenantId: 'tenant-1', messageId: 'message-1' }),
    );
  });

  it('downloads incoming messages and persists them without duplicates', async () => {
    const incoming = [
      {
        uid: '42',
        senderEmail: 'client@example.com',
        recipients: 'user@example.com',
        subject: 'Consulta',
        bodyText: 'Hola',
        receivedAt: new Date(),
        isRead: false,
        starred: false,
      },
    ];
    imapConnection.fetchInbox.mockResolvedValue({
      uidValidity: '200',
      messages: incoming,
    });

    await expect(service.syncInbox('tenant-1')).resolves.toEqual({
      synced: 1,
      mailbox: 'user@example.com',
    });
    expect(repository.syncInboxMessages).toHaveBeenCalledWith(
      'tenant-1',
      'user@example.com',
      '200',
      incoming,
    );
  });

  it('keeps a failed message in history without exposing provider details', async () => {
    emailService.sendTenantText.mockRejectedValue(new Error('535 auth failed'));

    await expect(
      service.send('tenant-1', 'user-1', {
        to: 'client@example.com',
        subject: 'Hola',
        body: 'Mensaje',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(repository.markFailed).toHaveBeenCalledWith(
      'tenant-1',
      'message-1',
      '535 auth failed',
    );
  });

  it('does not expose IMAP provider errors or credentials in sync responses', async () => {
    imapConnection.fetchInbox.mockRejectedValue(
      new Error('LOGIN user@example.com secret provider detail'),
    );
    const error = await service.syncInbox('tenant-1').catch((value) => value);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify(error.getResponse())).not.toMatch(
      /secret|provider detail/,
    );
    expect(repository.syncInboxMessages).not.toHaveBeenCalled();
  });

  it('does not download or list another mailbox when IMAP is disabled', async () => {
    integrationsService.getEnabledImapConfig.mockResolvedValue(null);
    await expect(service.listInbox('tenant-1')).resolves.toEqual([]);
    await expect(service.syncInbox('tenant-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.listInbox).not.toHaveBeenCalled();
    expect(imapConnection.fetchInbox).not.toHaveBeenCalled();
  });

  it('uses the configured tenant mailbox in normalized inbox queries', async () => {
    integrationsService.getEnabledImapConfig.mockResolvedValue({
      user: 'MailBox@Example.COM',
    });
    await service.listInbox('tenant-2');
    expect(integrationsService.getEnabledImapConfig).toHaveBeenCalledWith(
      'tenant-2',
    );
    expect(repository.listInbox).toHaveBeenCalledWith(
      'tenant-2',
      'mailbox@example.com',
    );
  });
});

describe('Application inbox persistence boundary', () => {
  it('scopes reads and duplicate detection to tenant, mailbox, UIDVALIDITY, and UID', async () => {
    const transaction = {
      appEmailInboxMessage: {
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const prisma = {
      appEmailInboxMessage: { findMany: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation((callback) => callback(transaction)),
    };
    const repository = new ApplicationEmailRepository(prisma as never);
    await repository.listInbox('tenant-a', 'a@example.com');
    expect(prisma.appEmailInboxMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', mailbox: 'a@example.com' },
      }),
    );
    const message = {
      uid: '42',
      senderEmail: 'sender@example.com',
      recipients: 'a@example.com',
      subject: 'Hello',
      bodyText: 'Body',
      receivedAt: new Date('2026-09-18'),
      isRead: false,
      starred: false,
    };
    for (const [tenant, mailbox] of [
      ['tenant-a', 'a@example.com'],
      ['tenant-a', 'b@example.com'],
      ['tenant-b', 'a@example.com'],
    ]) {
      await repository.syncInboxMessages(tenant, mailbox, '200', [message]);
      expect(
        transaction.appEmailInboxMessage.deleteMany,
      ).toHaveBeenLastCalledWith({
        where: { tenantId: tenant, mailbox, uidValidity: { not: '200' } },
      });
      expect(transaction.appEmailInboxMessage.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            tenantId_mailbox_uidValidity_uid: {
              tenantId: tenant,
              mailbox,
              uidValidity: '200',
              uid: '42',
            },
          },
          create: {
            tenantId: tenant,
            mailbox,
            uidValidity: '200',
            ...message,
          },
        }),
      );
    }
  });

  it('clears a previous UIDVALIDITY even when the reset mailbox is empty', async () => {
    const transaction = {
      appEmailInboxMessage: {
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const prisma = {
      appEmailInboxMessage: { findMany: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation((callback) => callback(transaction)),
    };

    await new ApplicationEmailRepository(prisma as never).syncInboxMessages(
      'tenant-a',
      'a@example.com',
      '201',
      [],
    );

    expect(transaction.appEmailInboxMessage.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mailbox: 'a@example.com',
        uidValidity: { not: '201' },
      },
    });
    expect(transaction.appEmailInboxMessage.upsert).not.toHaveBeenCalled();
  });
});

describe('Email inbox capability status', () => {
  it('derives incoming and outgoing capability independently without exposing credentials', async () => {
    const integrations = {
      getEmailIntegration: jest.fn().mockResolvedValue({
        enabled: false,
        configured: true,
        fromEmail: 'system@example.com',
        incoming: { enabled: true, configured: true, password: 'hidden' },
      }),
    };
    const service = new EmailService({} as never, integrations as never);
    await expect(
      service.getTenantEmailStatus('tenant-1', 'user@example.com'),
    ).resolves.toEqual({
      enabled: false,
      outgoingEnabled: false,
      incomingEnabled: true,
      mailboxAddress: 'user@example.com',
      automaticSender: 'system@example.com',
    });
    expect(integrations.getEmailIntegration).toHaveBeenCalledWith('tenant-1');
  });
});

import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { CommunicationsService } from './communications.service';
import { CommunicationHubService } from './hub.service';
import {
  CommunicationIdentityDto,
  CommunicationMessagesQueryDto,
  CommunicationNoteDto,
  CommunicationSettingsDto,
} from './hub.dto';

describe('CommunicationHubService isolation and controls', () => {
  const page = { page: 1, limit: 20 };
  let prisma: {
    communicationSettings: { findUnique: jest.Mock };
    communicationMessage: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
    };
    communicationIdentity: { findFirst: jest.Mock };
    communicationNote: { create: jest.Mock };
    communicationNotification: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    invoice: { findFirst: jest.Mock };
  };
  let integrations: { getEnabledSmtpConfig: jest.Mock };
  let events: { emit: jest.Mock };
  let core: { queueInvoice: jest.Mock; retry: jest.Mock };
  let service: CommunicationHubService;

  beforeEach(() => {
    prisma = {
      communicationSettings: {
        findUnique: jest.fn().mockResolvedValue({
          enabled: true,
          emailEnabled: true,
          invoiceEmailEnabled: true,
        }),
      },
      communicationMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
      },
      communicationIdentity: { findFirst: jest.fn() },
      communicationNote: {
        create: jest.fn().mockResolvedValue({ id: 'note' }),
      },
      communicationNotification: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn(),
      },
      invoice: { findFirst: jest.fn().mockResolvedValue({ id: 'invoice' }) },
    };
    integrations = {
      getEnabledSmtpConfig: jest.fn().mockResolvedValue({
        fromEmail: 'no-reply@tenant.test',
        password: 'secret',
      }),
    };
    events = { emit: jest.fn() };
    core = { queueInvoice: jest.fn(), retry: jest.fn() };
    service = new CommunicationHubService(
      prisma as unknown as PrismaService,
      integrations as unknown as IntegrationsService,
      events as unknown as EventEmitter2,
      core as unknown as CommunicationsService,
    );
  });

  it('defaults all feature flags to false without returning config secrets', async () => {
    prisma.communicationSettings.findUnique.mockResolvedValue(null);
    expect(await service.settings('tenant-a')).toEqual({
      enabled: false,
      emailEnabled: false,
      invoiceEmailEnabled: false,
    });
    expect(integrations.getEnabledSmtpConfig).not.toHaveBeenCalled();
  });

  it('blocks delivery reads before accessing messages when email is disabled', async () => {
    prisma.communicationSettings.findUnique.mockResolvedValue({
      enabled: true,
      emailEnabled: false,
    });
    await expect(service.messages('tenant-a', page)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.communicationMessage.findMany).not.toHaveBeenCalled();
  });

  it('restricts message lists and counts to the tenant and status', async () => {
    await service.messages('tenant-a', { ...page, status: 'FAILED' });
    expect(prisma.communicationMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          entityType: 'INVOICE',
          status: 'FAILED',
        },
        skip: 0,
        take: 20,
      }),
    );
    expect(prisma.communicationMessage.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', entityType: 'INVOICE', status: 'FAILED' },
    });
  });

  it('does not disclose or retry another tenant message', async () => {
    prisma.communicationMessage.findFirst.mockResolvedValue(null);
    await expect(
      service.retry('tenant-a', 'user-a', 'other-message'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.communicationMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'other-message',
          tenantId: 'tenant-a',
          entityType: 'INVOICE',
        },
      }),
    );
    expect(core.retry).not.toHaveBeenCalled();
  });

  it('validates invoice tenant ownership before queuing or writing notes', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);
    await expect(
      service.sendInvoice('tenant-a', 'user-a', 'other-invoice'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createNote('tenant-a', 'user-a', 'other-invoice', {
        body: 'private',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-invoice', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(core.queueInvoice).not.toHaveBeenCalled();
    expect(prisma.communicationNote.create).not.toHaveBeenCalled();
  });

  it('cannot modify another tenant sender identity', async () => {
    prisma.communicationIdentity.findFirst.mockResolvedValue(null);
    await expect(
      service.updateIdentity('tenant-a', 'user-a', 'other-identity', {
        replyTo: 'me@example.test',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(integrations.getEnabledSmtpConfig).not.toHaveBeenCalled();
  });

  it('rejects a forged SMTP sender before persisting identity', async () => {
    await expect(
      service.createIdentity('tenant-a', 'user-a', {
        type: 'SYSTEM',
        fromEmail: 'spoof@different.test',
        isDefault: true,
        outboundEnabled: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(integrations.getEnabledSmtpConfig).toHaveBeenCalledWith('tenant-a');
  });

  it('filters notification lists and counts by both tenant and authenticated owner', async () => {
    await service.notifications('tenant-a', 'user-a', page);
    expect(prisma.communicationNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', userId: 'user-a' },
      }),
    );
    expect(prisma.communicationNotification.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', userId: 'user-a', readAt: null },
    });
  });

  it('refuses marking a notification owned by another user as read', async () => {
    prisma.communicationNotification.findFirst.mockResolvedValue(null);
    await expect(
      service.readNotification('tenant-a', 'user-a', 'private-notification'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.communicationNotification.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'private-notification',
        tenantId: 'tenant-a',
        userId: 'user-a',
      },
    });
    expect(prisma.communicationNotification.updateMany).not.toHaveBeenCalled();
  });

  it('stores notes as text and audits metadata without body content', async () => {
    await service.createNote('tenant-a', 'user-a', 'invoice', {
      body: '<script>private-text</script>',
    });
    expect(prisma.communicationNote.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        entityType: 'INVOICE',
        entityId: 'invoice',
        body: '<script>private-text</script>',
        createdBy: 'user-a',
      },
    });
    expect(events.emit).toHaveBeenCalledWith('audit.log', {
      tenantId: 'tenant-a',
      userId: 'user-a',
      module: 'communications',
      action: 'note.created',
      resourceId: 'note',
      after: { entityType: 'INVOICE', entityId: 'invoice' },
    });
    expect(JSON.stringify(events.emit.mock.calls)).not.toContain(
      'private-text',
    );
  });
});

describe('Communication Hub input validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it.each([
    [CommunicationSettingsDto, { enabled: null }],
    [CommunicationSettingsDto, { enabled: 'true' }],
    [CommunicationMessagesQueryDto, { limit: 1000 }],
    [CommunicationMessagesQueryDto, { status: 'DELIVERED' }],
    [CommunicationNoteDto, { body: '   ' }],
    [CommunicationNoteDto, { body: 'note', tenantId: 'victim' }],
    [
      CommunicationIdentityDto,
      {
        type: 'PERSONAL',
        fromEmail: 'a@example.test',
        isDefault: true,
        outboundEnabled: true,
      },
    ],
    [
      CommunicationIdentityDto,
      {
        type: 'SYSTEM',
        fromEmail: 'a@example.test\r\nBcc:b@example.test',
        isDefault: true,
        outboundEnabled: true,
      },
    ],
  ])('rejects invalid or extra payload %#', async (metatype, value) => {
    await expect(
      pipe.transform(value, { type: 'body', metatype }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

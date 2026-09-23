import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationsEmailProvider } from './communications-email.provider';
import { CommunicationsRepository } from './communications.repository';
import { CommunicationsService } from './communications.service';
import { InvoiceCommunicationListener } from './invoice-communication.listener';

jest.mock('../integrations/integrations.service', () => ({
  IntegrationsService: class {},
}));

function invoiceFixture(email: string | null) {
  return {
    id: 'invoice-a',
    status: 'ISSUED',
    pdfFileId: 'pdf-a',
    invoiceNumber: '123',
    invoicePrefix: '001-',
    total: 100,
    issuedAt: new Date('2026-09-18T12:00:00.000Z'),
    dueDate: null,
    tenant: { name: 'Tenant A', razonSocial: null },
    saleOrder: {
      customer: {
        email,
        firstName: 'Ana',
        secondFirstName: null,
        lastName: 'Test',
        secondLastName: null,
      },
    },
  };
}

describe('invoice.issued automatic communication', () => {
  const tenantId = 'tenant-a';
  const invoiceId = 'invoice-a';
  const userId = 'user-a';
  const event = { tenantId, invoiceId, issuedById: userId };
  let prisma: {
    communicationSettings: { findUnique: jest.Mock };
    communicationMessage: { findUnique: jest.Mock; create: jest.Mock };
    communicationNotification: { upsert: jest.Mock };
    communicationIdentity: { findFirst: jest.Mock };
    communicationTemplateVersion: { findFirst: jest.Mock };
    invoice: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock };
  };
  let files: { getById: jest.Mock };
  let listener: InvoiceCommunicationListener;
  let communications: CommunicationsService;

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
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      communicationNotification: { upsert: jest.fn().mockResolvedValue({}) },
      communicationIdentity: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'identity-a',
          fromEmail: 'sender@example.test',
          fromName: null,
          replyTo: null,
        }),
      },
      communicationTemplateVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-a',
          subject: 'Factura {{invoice.number}}',
          bodyText: 'Hola {{customer.name}}',
        }),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoiceFixture(null)),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: userId }) },
    };
    files = {
      getById: jest.fn().mockResolvedValue({
        id: 'pdf-a',
        mimeType: 'application/pdf',
        module: 'billing',
        entityType: 'invoice',
        entityId: invoiceId,
      }),
    };
    const repository = new CommunicationsRepository(
      prisma as unknown as PrismaService,
    );
    communications = new CommunicationsService(
      repository,
      files as unknown as FilesService,
      {} as CommunicationsEmailProvider,
      new EventEmitter2(),
    );
    listener = new InvoiceCommunicationListener(communications);
  });

  it('records a scoped, sanitized failure and lets the shared event finish for a missing recipient', async () => {
    await expect(listener.handle(event)).resolves.toBeUndefined();
    expect(prisma.communicationMessage.create).not.toHaveBeenCalled();
    expect(prisma.communicationNotification.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey: expect.stringContaining(invoiceId),
        },
      },
      update: {},
      create: expect.objectContaining({
        tenantId,
        userId,
        messageId: null,
        idempotencyKey: expect.stringContaining(invoiceId),
        title: 'No se pudo preparar el correo de la factura',
        body: 'El cliente no tiene un correo válido.',
      }),
    });
  });

  it('uses the same failure key when the business outbox redelivers the event', async () => {
    await listener.handle(event);
    await listener.handle(event);
    const [first, second] =
      prisma.communicationNotification.upsert.mock.calls.map(
        ([input]) => input,
      );
    expect(first.where).toEqual(second.where);
    expect(first.create.idempotencyKey).toBe(
      first.where.tenantId_idempotencyKey.idempotencyKey,
    );
    expect(second.create.idempotencyKey).toBe(
      second.where.tenantId_idempotencyKey.idempotencyKey,
    );
  });

  it('records a fixed reason when the default sender identity is missing', async () => {
    prisma.invoice.findFirst.mockResolvedValue(
      invoiceFixture('customer@example.test'),
    );
    prisma.communicationIdentity.findFirst.mockResolvedValue(null);
    await expect(listener.handle(event)).resolves.toBeUndefined();
    expect(prisma.communicationNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          body: 'Configurá una identidad predeterminada con salida habilitada.',
        }),
      }),
    );
  });

  it('records a fixed reason when the invoice no longer exists', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);
    await expect(listener.handle(event)).resolves.toBeUndefined();
    expect(prisma.communicationNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ body: 'Factura no encontrada.' }),
      }),
    );
  });

  it('records a fixed reason when the invoice lacks its saved PDF', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...invoiceFixture('customer@example.test'),
      pdfFileId: null,
    });
    await expect(listener.handle(event)).resolves.toBeUndefined();
    expect(prisma.communicationNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          body: 'La factura debe estar emitida y tener su PDF guardado.',
        }),
      }),
    );
  });

  it('records a fixed reason when the invoice template is missing', async () => {
    prisma.invoice.findFirst.mockResolvedValue(
      invoiceFixture('customer@example.test'),
    );
    prisma.communicationTemplateVersion.findFirst.mockResolvedValue(null);
    await expect(listener.handle(event)).resolves.toBeUndefined();
    expect(prisma.communicationNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          body: 'Publicá una versión de la plantilla INVOICE_ISSUED.',
        }),
      }),
    );
  });

  it('uses a sanitized reason for an invalid published template', async () => {
    prisma.invoice.findFirst.mockResolvedValue(
      invoiceFixture('customer@example.test'),
    );
    prisma.communicationTemplateVersion.findFirst.mockResolvedValue({
      id: 'template-a',
      subject: 'Factura {{secret-private-variable}}',
      bodyText: 'Hola',
    });
    await expect(listener.handle(event)).resolves.toBeUndefined();
    const saved = prisma.communicationNotification.upsert.mock.calls[0][0];
    expect(saved.create.body).toBe('La plantilla de factura no es válida.');
    expect(JSON.stringify(saved)).not.toContain('secret-private-variable');
  });

  it('records a fixed reason when the pinned PDF metadata is invalid', async () => {
    prisma.invoice.findFirst.mockResolvedValue(
      invoiceFixture('customer@example.test'),
    );
    files.getById.mockResolvedValue({
      mimeType: 'application/pdf',
      module: 'billing',
      entityType: 'invoice',
      entityId: 'another-invoice',
    });
    await expect(listener.handle(event)).resolves.toBeUndefined();
    expect(prisma.communicationNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          body: 'El archivo no es el PDF guardado de esta factura.',
        }),
      }),
    );
  });

  it('sanitizes a missing pinned PDF instead of persisting its raw error', async () => {
    prisma.invoice.findFirst.mockResolvedValue(
      invoiceFixture('customer@example.test'),
    );
    files.getById.mockRejectedValue(
      new NotFoundException('private path password=secret'),
    );
    await expect(listener.handle(event)).resolves.toBeUndefined();
    const saved = prisma.communicationNotification.upsert.mock.calls[0][0];
    expect(saved.create.body).toBe(
      'No se encontró el PDF guardado de esta factura.',
    );
    expect(JSON.stringify(saved)).not.toContain('password=secret');
  });

  it('records a scoped failure when the issuing actor no longer exists', async () => {
    prisma.invoice.findFirst.mockResolvedValue(
      invoiceFixture('customer@example.test'),
    );
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(listener.handle(event)).resolves.toBeUndefined();
    expect(prisma.communicationNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId,
          body: 'Usuario no encontrado en el tenant',
        }),
      }),
    );
  });

  it('does not invent a notification owner when the event has no issuing user', async () => {
    await expect(
      listener.handle({ tenantId, invoiceId }),
    ).resolves.toBeUndefined();
    expect(prisma.communicationNotification.upsert).not.toHaveBeenCalled();
  });

  it('propagates a notification persistence failure so the outbox retries', async () => {
    const outage = new Error('database unavailable');
    prisma.communicationNotification.upsert.mockRejectedValue(outage);
    await expect(listener.handle(event)).rejects.toBe(outage);
  });

  it('propagates unexpected database failures instead of treating them as configuration errors', async () => {
    const outage = new Error('database unavailable');
    prisma.invoice.findFirst.mockRejectedValue(outage);
    await expect(listener.handle(event)).rejects.toBe(outage);
    expect(prisma.communicationNotification.upsert).not.toHaveBeenCalled();
  });

  it('keeps manual send validation visible to the caller', async () => {
    await expect(
      communications.queueInvoice(tenantId, invoiceId, userId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.communicationNotification.upsert).not.toHaveBeenCalled();
  });

  it('keeps manual send disabled-setting errors visible to the caller', async () => {
    prisma.communicationSettings.findUnique.mockResolvedValue({
      enabled: false,
      emailEnabled: false,
      invoiceEmailEnabled: false,
    });
    await expect(
      communications.queueInvoice(tenantId, invoiceId, userId),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.communicationNotification.upsert).not.toHaveBeenCalled();
  });
});

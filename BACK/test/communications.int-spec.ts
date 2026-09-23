import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash, randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../src/prisma/prisma.service';
import { FilesService } from '../src/files/files.service';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { CommunicationsRepository } from '../src/communications/communications.repository';
import { CommunicationsService } from '../src/communications/communications.service';
import {
  CommunicationsEmailProvider,
  CommunicationDeliveryError,
} from '../src/communications/communications-email.provider';
import { CommunicationHubService } from '../src/communications/hub.service';
import { InvoiceCommunicationListener } from '../src/communications/invoice-communication.listener';
import { CommunicationsWorker } from '../src/communications/communications.worker';
import { OutboxService } from '../src/outbox/outbox.service';
import { OutboxRepository } from '../src/outbox/outbox.repository';

const url = process.env.COMMUNICATIONS_TEST_DATABASE_URL;
if (url && !/^\/joapycore_comms_test_[\w-]+$/.test(new URL(url).pathname)) {
  throw new Error(
    'COMMUNICATIONS_TEST_DATABASE_URL debe apuntar a una base aislada joapycore_comms_test_*',
  );
}
const redisUrl = process.env.COMMUNICATIONS_TEST_REDIS_URL;
if (redisUrl) {
  const parsed = new URL(redisUrl);
  if (
    !['redis:', 'rediss:'].includes(parsed.protocol) ||
    parsed.pathname !== '/15'
  ) {
    throw new Error(
      'COMMUNICATIONS_TEST_REDIS_URL debe usar la base Redis aislada 15',
    );
  }
}
const integration = url ? describe : describe.skip;

integration(
  'Communication vertical (isolated PostgreSQL / optional Redis)',
  () => {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const pdf = Buffer.from('%PDF-1.7\ncommunications-test-fixture');
    let prisma: PrismaService;
    let repository: CommunicationsRepository;
    let core: CommunicationsService;
    let hub: CommunicationHubService;
    let outbox: OutboxService;
    let events: EventEmitter2;
    const transport = { send: jest.fn() };
    let worker: CommunicationsWorker | undefined;
    let redisTestClient: Redis | undefined;
    let redisDatabaseClaimed = false;

    beforeAll(async () => {
      if (redisUrl) {
        redisTestClient = new Redis(redisUrl, { lazyConnect: true });
        await redisTestClient.connect();
        const existingKeys = await redisTestClient.dbsize();
        if (existingKeys !== 0) {
          throw new Error(
            `La base Redis 15 debe estar vacía antes de la prueba (${existingKeys} claves existentes)`,
          );
        }
        redisDatabaseClaimed = true;
      }
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
      await prisma.$connect();
      repository = new CommunicationsRepository(prisma);
      events = new EventEmitter2();
      const files = {
        getById: async (tenant: string, id: string) => {
          const file = await prisma.fileRecord.findFirst({
            where: { tenantId: tenant, id },
          });
          if (!file) throw new NotFoundException();
          return file;
        },
        getFileBuffer: jest.fn().mockResolvedValue(pdf),
      };
      core = new CommunicationsService(
        repository,
        files as unknown as FilesService,
        transport as unknown as CommunicationsEmailProvider,
        events,
      );
      hub = new CommunicationHubService(
        prisma,
        {
          getEnabledSmtpConfig: jest
            .fn()
            .mockResolvedValue({ fromEmail: 'no-reply@example.test' }),
        } as unknown as IntegrationsService,
        events,
        core,
      );
      outbox = new OutboxService(new OutboxRepository(prisma), events);
      const listener = new InvoiceCommunicationListener(core);
      events.on(
        'invoice.issued',
        // emitAsync must observe the listener promise for transactional Outbox retries.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        (event: Parameters<InvoiceCommunicationListener['handle']>[0]) =>
          listener.handle(event),
      );
      await prisma.tenant.create({
        data: { id: tenantId, name: 'Communication test' },
      });
      await prisma.tenantModule.create({
        data: { tenantId, moduleName: 'billing', active: true },
      });
      await prisma.user.create({
        data: {
          id: userId,
          tenantId,
          email: `${userId}@example.test`,
          passwordHash: 'unused-test-only',
          firstName: 'Test',
          lastName: 'User',
        },
      });
      await prisma.communicationSettings.create({
        data: {
          tenantId,
          enabled: true,
          emailEnabled: true,
          invoiceEmailEnabled: true,
        },
      });
      await prisma.communicationIdentity.create({
        data: {
          tenantId,
          fromEmail: 'no-reply@example.test',
          replyTo: 'sales@example.test',
          isDefault: true,
          outboundEnabled: true,
        },
      });
      await prisma.communicationTemplateVersion.create({
        data: {
          tenantId,
          code: 'INVOICE_ISSUED',
          version: 1,
          subject: 'Factura {{invoice.number}}',
          bodyText: 'Hola {{customer.name}}',
        },
      });
    });
    beforeEach(() => {
      transport.send
        .mockReset()
        .mockResolvedValue({ messageId: 'smtp-test-id' });
    });

    afterAll(async () => {
      try {
        await worker?.onModuleDestroy();
      } finally {
        try {
          if (redisTestClient && redisDatabaseClaimed) {
            await redisTestClient.flushdb();
            expect(await redisTestClient.dbsize()).toBe(0);
          }
        } finally {
          redisTestClient?.disconnect();
          if (prisma) {
            try {
              const where = { tenantId };
              await prisma.communicationNotification.deleteMany({ where });
              await prisma.communicationDeliveryAttempt.deleteMany({ where });
              await prisma.communicationNote.deleteMany({ where });
              await prisma.communicationMessage.deleteMany({ where });
              await prisma.communicationTemplateVersion.deleteMany({ where });
              await prisma.communicationIdentity.deleteMany({ where });
              await prisma.communicationSettings.deleteMany({ where });
              await prisma.outboxEvent.deleteMany({ where });
              await prisma.invoice.deleteMany({ where });
              await prisma.fileRecord.deleteMany({ where });
              await prisma.saleOrder.deleteMany({ where });
              await prisma.customer.deleteMany({ where });
              await prisma.user.deleteMany({ where });
              await prisma.tenantModule.deleteMany({ where });
              await prisma.tenant.deleteMany({ where: { id: tenantId } });
            } finally {
              await prisma.onModuleDestroy();
            }
          }
        }
      }
    });

    async function invoiceFixture() {
      const id = randomUUID();
      const customer = await prisma.customer.create({
        data: {
          tenantId,
          firstName: 'Ana',
          lastName: 'Test',
          email: 'customer@example.test',
        },
      });
      const sale = await prisma.saleOrder.create({
        data: { tenantId, customerId: customer.id, orderDate: new Date() },
      });
      const file = await prisma.fileRecord.create({
        data: {
          tenantId,
          module: 'billing',
          entityType: 'invoice',
          entityId: id,
          key: `${id}.pdf`,
          originalName: 'factura.pdf',
          mimeType: 'application/pdf',
          sizeBytes: pdf.length,
          checksum: createHash('sha256').update(pdf).digest('hex'),
        },
      });
      return prisma.invoice.create({
        data: {
          id,
          tenantId,
          saleOrderId: sale.id,
          status: 'ISSUED',
          total: 150000,
          pdfFileId: file.id,
          issuedAt: new Date(),
        },
      });
    }

    it('commits the event, queues once under concurrent redelivery, pins PDF, records timeline and private notifications', async () => {
      const invoice = await invoiceFixture();
      const eventId = await prisma.$transaction((tx) =>
        outbox.enqueue(tx, tenantId, 'invoice.issued', {
          tenantId,
          invoiceId: invoice.id,
          issuedById: userId,
        }),
      );
      expect(await outbox.dispatch(eventId)).toBe(true);
      const messages = await Promise.all(
        Array.from({ length: 8 }, () =>
          core.queueInvoice(tenantId, invoice.id, userId),
        ),
      );
      expect(new Set(messages.map((message) => message!.id)).size).toBe(1);
      const message = messages[0]!;
      expect(message.pdfFileId).toBe(invoice.pdfFileId);
      expect(message.replyTo).toBe('sales@example.test');
      expect(transport.send).not.toHaveBeenCalled();
      await Promise.all(
        Array.from({ length: 6 }, () => core.process(tenantId, message.id)),
      );
      expect(transport.send).toHaveBeenCalledTimes(1);
      expect(transport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          attachment: expect.objectContaining({ content: pdf }),
          replyTo: 'sales@example.test',
        }),
      );
      expect((await repository.message(tenantId, message.id))?.status).toBe(
        'SENT',
      );
      await hub.createNote(tenantId, userId, invoice.id, {
        body: 'Revisado por el equipo',
      });
      const timeline = await hub.timeline(tenantId, invoice.id, {
        page: 1,
        limit: 20,
      });
      expect(timeline.items.map((item) => item.kind)).toEqual(
        expect.arrayContaining(['NOTE', 'MESSAGE']),
      );
      expect(
        (await hub.notifications(tenantId, userId, { page: 1, limit: 20 }))
          .unreadCount,
      ).toBeGreaterThan(0);
      expect(
        (
          await hub.notifications(tenantId, randomUUID(), {
            page: 1,
            limit: 20,
          })
        ).items,
      ).toEqual([]);
      expect(await repository.message(randomUUID(), message.id)).toBeNull();
      const otherTenantId = randomUUID();
      await prisma.tenant.create({
        data: { id: otherTenantId, name: 'Other communication test' },
      });
      try {
        await prisma.communicationSettings.create({
          data: { tenantId: otherTenantId, enabled: true, emailEnabled: true },
        });
        expect(
          (await hub.messages(otherTenantId, { page: 1, limit: 20 })).items,
        ).toEqual([]);
        expect(
          (
            await hub.notifications(otherTenantId, userId, {
              page: 1,
              limit: 20,
            })
          ).items,
        ).toEqual([]);
        expect(await repository.message(otherTenantId, message.id)).toBeNull();
      } finally {
        await prisma.communicationSettings.deleteMany({
          where: { tenantId: otherTenantId },
        });
        await prisma.tenant.deleteMany({ where: { id: otherTenantId } });
      }
      await expect(
        core.queueInvoice(tenantId, randomUUID(), userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('serializes immutable template versions and updates the authorized identity', async () => {
      const versions = await Promise.all(
        Array.from({ length: 3 }, () =>
          hub.createTemplateVersion(tenantId, userId, {
            subject: 'Factura {{invoice.number}}',
            bodyText: 'Hola {{customer.name}}',
          }),
        ),
      );
      expect(versions.map((version) => version.version).sort()).toEqual([
        2, 3, 4,
      ]);
      const identity = await repository.identity(tenantId);
      const updated = await hub.updateIdentity(tenantId, userId, identity!.id, {
        fromName: 'Mi empresa',
      });
      expect(updated.fromName).toBe('Mi empresa');
      expect(updated.isDefault).toBe(true);
    });

    it('retries confirmed failures and does not resend an ambiguous SMTP result', async () => {
      const invoice = await invoiceFixture();
      const message = (await core.queueInvoice(tenantId, invoice.id, userId))!;
      transport.send.mockRejectedValueOnce(
        new CommunicationDeliveryError(
          'SMTP_REJECTED',
          false,
          'Rechazo confirmado',
        ),
      );
      await core.process(tenantId, message.id);
      const waiting = await repository.message(tenantId, message.id);
      expect(waiting?.status).toBe('QUEUED');
      expect(waiting!.availableAt.getTime()).toBeGreaterThan(Date.now());
      expect(
        await prisma.communicationDeliveryAttempt.findFirst({
          where: { tenantId, messageId: message.id, attempt: 1 },
          select: { status: true, errorCode: true },
        }),
      ).toEqual({ status: 'FAILED', errorCode: 'SMTP_REJECTED' });
      await core.process(tenantId, message.id);
      expect(transport.send).toHaveBeenCalledTimes(1);
      await prisma.communicationMessage.updateMany({
        where: { tenantId, id: message.id },
        data: { availableAt: new Date(0) },
      });
      transport.send.mockRejectedValueOnce(
        new CommunicationDeliveryError(
          'SMTP_OUTCOME_UNKNOWN',
          true,
          'Revisar proveedor',
        ),
      );
      await core.process(tenantId, message.id);
      expect((await repository.message(tenantId, message.id))?.status).toBe(
        'UNKNOWN',
      );
      expect(
        await prisma.communicationDeliveryAttempt.findFirst({
          where: { tenantId, messageId: message.id, attempt: 2 },
          select: { status: true, errorCode: true },
        }),
      ).toEqual({ status: 'UNKNOWN', errorCode: 'SMTP_OUTCOME_UNKNOWN' });
      await expect(core.retry(tenantId, message.id, userId)).rejects.toThrow(
        'incierto',
      );
      await core.process(tenantId, message.id);
      expect(transport.send).toHaveBeenCalledTimes(2);
    });

    it('recovers interrupted processing as UNKNOWN without sending twice', async () => {
      const invoice = await invoiceFixture();
      const message = (await core.queueInvoice(tenantId, invoice.id, userId))!;
      await repository.claim(tenantId, message.id, new Date());
      await prisma.communicationMessage.updateMany({
        where: { tenantId, id: message.id },
        data: { lockedAt: new Date(0) },
      });
      await core.recoverInterrupted();
      expect((await repository.message(tenantId, message.id))?.status).toBe(
        'UNKNOWN',
      );
      await core.process(tenantId, message.id);
      expect(transport.send).not.toHaveBeenCalled();
    });

    (redisUrl ? it : it.skip)(
      'dispatches through real BullMQ and Redis before SMTP adapter',
      async () => {
        worker = new CommunicationsWorker(
          new ConfigService({
            COMMUNICATIONS_WORKER_ENABLED: 'true',
            REDIS_URL: redisUrl,
          }),
          repository,
          core,
        );
        worker.onModuleInit();
        const invoice = await invoiceFixture();
        const message = (await core.queueInvoice(
          tenantId,
          invoice.id,
          userId,
        ))!;
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          await worker.dispatchDue();
          if (
            (await repository.message(tenantId, message.id))?.status === 'SENT'
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect((await repository.message(tenantId, message.id))?.status).toBe(
          'SENT',
        );
        expect(
          transport.send.mock.calls.filter(([input]) =>
            String(input.messageId).includes(message.id),
          ),
        ).toHaveLength(1);
      },
      20000,
    );
  },
);

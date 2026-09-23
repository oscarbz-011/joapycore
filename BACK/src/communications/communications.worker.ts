import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { CommunicationsRepository } from './communications.repository';
import { CommunicationsService } from './communications.service';

const QUEUE = 'communications-email';
type DeliveryJob = { tenantId: string; messageId: string };

export function redisConnection(value: string): ConnectionOptions {
  const url = new URL(value);
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('REDIS_URL inválida');
  const db = Number(url.pathname.slice(1) || '0');
  if (!Number.isInteger(db) || db < 0) throw new Error('Base Redis inválida');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    db,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
  };
}

@Injectable()
export class CommunicationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommunicationsWorker.name);
  private queue?: Queue<DeliveryJob>;
  private worker?: Worker<DeliveryJob>;
  private scanning = false;
  private lastWarningAt = new Map<string, number>();

  private warnUnavailable(code: string) {
    const now = Date.now();
    if (now - (this.lastWarningAt.get(code) ?? 0) < 30_000) return;
    this.lastWarningAt.set(code, now);
    this.logger.warn(code);
  }

  constructor(
    private readonly config: ConfigService,
    private readonly repository: CommunicationsRepository,
    private readonly communications: CommunicationsService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('COMMUNICATIONS_WORKER_ENABLED') !== 'true')
      return;
    const url = this.config.get<string>('REDIS_URL');
    if (!url)
      throw new Error(
        'REDIS_URL es obligatoria al habilitar el worker de comunicaciones',
      );
    const connection = redisConnection(url);
    const prefix =
      this.config.get<string>('COMMUNICATIONS_QUEUE_PREFIX') || 'bull';
    this.queue = new Queue<DeliveryJob>(QUEUE, {
      prefix,
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
    });
    this.worker = new Worker<DeliveryJob>(
      QUEUE,
      async (job) => {
        if (
          typeof job.data.tenantId !== 'string' ||
          typeof job.data.messageId !== 'string'
        )
          throw new Error('Job inválido');
        await this.communications.process(
          job.data.tenantId,
          job.data.messageId,
        );
      },
      { connection, concurrency: 3, prefix },
    );
    this.queue.on('error', () =>
      this.warnUnavailable('communications.queue.unavailable'),
    );
    this.worker.on('error', () =>
      this.warnUnavailable('communications.worker.unavailable'),
    );
    this.worker.on('failed', (job) =>
      this.logger.warn(
        `communications.job.failed jobId=${job?.id ?? 'unknown'}`,
      ),
    );
  }

  // PostgreSQL is the durable outbox. Redis can be flushed/restarted without
  // losing queued intent; each dispatch is safe under multiple API instances.
  @Interval(10_000)
  async dispatchDue() {
    if (!this.queue || this.scanning) return;
    this.scanning = true;
    try {
      await this.communications.recoverInterrupted();
      const messages = await this.repository.due(new Date());
      for (const message of messages) {
        await this.queue.add(
          'send',
          { tenantId: message.tenantId, messageId: message.id },
          {
            jobId: `${message.id}-${message.attempts}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      }
    } catch {
      this.warnUnavailable(
        'communications.dispatch.failed; la intención permanece en PostgreSQL',
      );
    } finally {
      this.scanning = false;
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}

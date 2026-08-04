import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsGateway } from '../gateway/notifications.gateway';

const SKIP_EVENTS = new Set(['audit.log']);

@Injectable()
export class WsBridgeListener implements OnModuleInit {
  constructor(
    private readonly emitter: EventEmitter2,
    private readonly gateway: NotificationsGateway,
  ) {}

  onModuleInit() {
    this.emitter.onAny((event: string | string[], payload: unknown) => {
      const eventName = Array.isArray(event) ? event.join('.') : event;
      if (SKIP_EVENTS.has(eventName)) return;
      if (!payload || typeof payload !== 'object') return;
      const tenantId = (payload as Record<string, unknown>).tenantId;
      if (typeof tenantId !== 'string') return;
      this.gateway.emitToTenant(tenantId, eventName, payload);
    });
  }
}

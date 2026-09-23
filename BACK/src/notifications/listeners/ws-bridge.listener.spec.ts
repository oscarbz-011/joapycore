import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsGateway } from '../gateway/notifications.gateway';
import { WsBridgeListener } from './ws-bridge.listener';

describe('WsBridgeListener communication privacy', () => {
  it('never broadcasts private communications to every user of the tenant', () => {
    const events = new EventEmitter2();
    const gateway = { emitToTenant: jest.fn() };
    new WsBridgeListener(
      events,
      gateway as unknown as NotificationsGateway,
    ).onModuleInit();
    events.emit('communication.notification.created', {
      tenantId: 'a',
      body: 'private',
    });
    events.emit('communications.note.created', {
      tenantId: 'a',
      body: 'private',
    });
    expect(gateway.emitToTenant).not.toHaveBeenCalled();
    events.emit('invoice.issued', { tenantId: 'a', invoiceId: 'i' });
    expect(gateway.emitToTenant).toHaveBeenCalledTimes(1);
  });
});

import { BadGatewayException } from '@nestjs/common';
import { ApplicationEmailService } from './application-email.service';

describe('ApplicationEmailService', () => {
  let service: ApplicationEmailService;
  let repository: {
    list: jest.Mock;
    findById: jest.Mock;
    createPending: jest.Mock;
    markSent: jest.Mock;
    markFailed: jest.Mock;
  };
  let emailService: {
    sendTenantText: jest.Mock;
    isTenantEmailEnabled: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    repository = {
      list: jest.fn().mockResolvedValue([]),
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
    };
    eventEmitter = { emit: jest.fn() };
    service = new ApplicationEmailService(
      repository as never,
      emailService as never,
      eventEmitter as never,
    );
  });

  it('reports whether the tenant integration is enabled', async () => {
    await expect(service.status('tenant-1')).resolves.toEqual({
      enabled: true,
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
});

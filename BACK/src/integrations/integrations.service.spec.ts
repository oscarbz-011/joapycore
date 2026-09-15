import { ServiceUnavailableException } from '@nestjs/common';
import {
  decryptIntegrationConfig,
  encryptIntegrationConfig,
} from './integration-credentials.util';
import {
  IntegrationsService,
  type SmtpIntegrationConfig,
} from './integrations.service';

describe('IntegrationsService', () => {
  const secret = 'integration-secret-with-at-least-32-characters';
  const existingConfig: SmtpIntegrationConfig = {
    host: 'smtp.old.example',
    port: 587,
    secure: false,
    user: 'old-user',
    password: 'stored-password',
    fromEmail: 'old@example.com',
  };

  function createService(encryptionKey: string | undefined = secret) {
    const repository = {
      findByKey: jest.fn(),
      upsert: jest.fn(),
      markTestResult: jest.fn(),
    };
    const configService = {
      get: jest.fn().mockReturnValue(encryptionKey),
    };
    return {
      repository,
      service: new IntegrationsService(
        repository as never,
        configService as never,
      ),
    };
  }

  it('never exposes the stored password or the provider error', async () => {
    const { repository, service } = createService();
    repository.findByKey.mockResolvedValue({
      enabled: true,
      status: 'ERROR',
      encryptedConfig: encryptIntegrationConfig(existingConfig, secret),
      lastTestedAt: new Date('2026-09-15T12:00:00Z'),
      lastTestOk: false,
      lastError: 'provider detail',
    });

    const result = await service.getEmailIntegration('tenant-1');

    expect(result).toMatchObject({
      enabled: true,
      configured: true,
      hasPassword: true,
      host: 'smtp.old.example',
    });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('lastError');
  });

  it('preserves an omitted password and invalidates the previous test', async () => {
    const { repository, service } = createService();
    const existing = {
      enabled: true,
      status: 'CONNECTED',
      encryptedConfig: encryptIntegrationConfig(existingConfig, secret),
      lastTestedAt: new Date(),
      lastTestOk: true,
      lastError: null,
    };
    repository.findByKey.mockResolvedValue(existing);

    await service.updateEmailIntegration('tenant-1', {
      enabled: true,
      host: 'smtp.new.example',
      port: 465,
      secure: true,
      user: 'new-user',
      fromEmail: 'new@example.com',
      fromName: 'New Sender',
    });

    const saved = repository.upsert.mock.calls[0][2];
    expect(saved).toMatchObject({
      status: 'DISCONNECTED',
      lastTestedAt: null,
      lastTestOk: null,
      lastError: null,
    });
    expect(
      decryptIntegrationConfig<SmtpIntegrationConfig>(
        saved.encryptedConfig,
        secret,
      ),
    ).toEqual({
      host: 'smtp.new.example',
      port: 465,
      secure: true,
      user: 'new-user',
      password: 'stored-password',
      fromEmail: 'new@example.com',
      fromName: 'New Sender',
    });
  });

  it('refuses to store credentials without an encryption key', async () => {
    const { repository, service } = createService('');
    repository.findByKey.mockResolvedValue(null);

    await expect(
      service.updateEmailIntegration('tenant-1', {
        enabled: true,
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        fromEmail: 'sender@example.com',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});

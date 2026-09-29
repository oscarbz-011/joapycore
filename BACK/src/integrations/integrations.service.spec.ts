import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { connect as connectTls } from 'node:tls';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImapFlow } from 'imapflow';
import { UpdateIncomingEmailIntegrationDto } from './dto/update-incoming-email-integration.dto';
import { ImapConnectionService } from './imap-connection.service';
import {
  decryptIntegrationConfig,
  encryptIntegrationConfig,
} from './integration-credentials.util';
import {
  type ImapIntegrationConfig,
  IntegrationsService,
  type SmtpIntegrationConfig,
} from './integrations.service';

jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
jest.mock('node:tls', () => ({ connect: jest.fn() }));

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
    const imapConnection = {
      verify: jest.fn(),
      fetchInbox: jest.fn(),
    };
    return {
      repository,
      imapConnection,
      service: new IntegrationsService(
        repository as never,
        configService as never,
        imapConnection,
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

  it('preserves an omitted IMAP password independently from SMTP', async () => {
    const { repository, service } = createService();
    const incomingConfig: ImapIntegrationConfig = {
      host: 'imap.old.example',
      port: 993,
      secure: true,
      user: 'mailbox@example.com',
      password: 'stored-imap-password',
    };
    repository.findByKey.mockResolvedValue({
      enabled: true,
      status: 'CONNECTED',
      encryptedConfig: encryptIntegrationConfig(incomingConfig, secret),
      lastTestedAt: new Date(),
      lastTestOk: true,
      lastError: null,
    });

    await service.updateIncomingEmailIntegration('tenant-1', {
      enabled: true,
      host: 'imap.new.example',
      port: 143,
      secure: false,
      user: 'new-mailbox@example.com',
    });

    const saved = repository.upsert.mock.calls[0][2];
    expect(repository.upsert.mock.calls[0][1]).toBe('imap');
    expect(
      decryptIntegrationConfig<ImapIntegrationConfig>(
        saved.encryptedConfig,
        secret,
      ),
    ).toEqual({
      host: 'imap.new.example',
      port: 143,
      secure: false,
      user: 'new-mailbox@example.com',
      password: 'stored-imap-password',
    });
  });

  it('rejects first-time IMAP enablement without a password', async () => {
    const { repository, service } = createService();
    repository.findByKey.mockResolvedValue(null);

    await expect(
      service.updateIncomingEmailIntegration('tenant-1', {
        enabled: true,
        host: 'imap.example.com',
        port: 993,
        secure: true,
        user: 'mailbox@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('does not report or return an incomplete enabled IMAP configuration', async () => {
    const { repository, service } = createService();
    repository.findByKey.mockImplementation((_tenant, key) =>
      Promise.resolve(
        key === 'imap'
          ? {
              enabled: true,
              encryptedConfig: encryptIntegrationConfig(
                {
                  host: 'imap.example.com',
                  port: 993,
                  secure: true,
                  user: 'mailbox@example.com',
                },
                secret,
              ),
            }
          : null,
      ),
    );

    await expect(
      service.getEmailIntegration('tenant-1'),
    ).resolves.toMatchObject({
      incoming: { enabled: true, configured: false, hasPassword: false },
    });
    await expect(service.getEnabledImapConfig('tenant-1')).resolves.toBeNull();
  });

  it('tests the saved IMAP credentials and records the result', async () => {
    const { repository, imapConnection, service } = createService();
    const incomingConfig: ImapIntegrationConfig = {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      user: 'mailbox@example.com',
      password: 'imap-password',
    };
    repository.findByKey.mockResolvedValue({
      encryptedConfig: encryptIntegrationConfig(incomingConfig, secret),
    });

    await expect(
      service.testIncomingEmailIntegration('tenant-1'),
    ).resolves.toEqual({ ok: true });
    expect(imapConnection.verify).toHaveBeenCalledWith(incomingConfig);
    expect(repository.markTestResult).toHaveBeenCalledWith(
      'tenant-1',
      'imap',
      true,
    );
  });

  it('defaults incoming configuration to certificate-verified direct TLS without secrets', async () => {
    const { repository, service } = createService();
    repository.findByKey.mockResolvedValue(null);
    expect(
      (await service.getEmailIntegration('tenant-1')).incoming,
    ).toMatchObject({
      enabled: false,
      configured: false,
      secure: true,
      port: 993,
      hasPassword: false,
    });
    repository.findByKey.mockImplementation((_tenant, key) =>
      Promise.resolve(
        key === 'imap'
          ? {
              enabled: true,
              status: 'ERROR',
              encryptedConfig: encryptIntegrationConfig(
                {
                  host: 'imap.example.com',
                  port: 993,
                  secure: true,
                  user: 'inbox@example.com',
                  password: 'secret-imap',
                },
                secret,
              ),
              lastError: 'sensitive-provider-detail',
            }
          : null,
      ),
    );
    const result = await service.getEmailIntegration('tenant-1');
    expect(result.incoming.hasPassword).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /secret-imap|sensitive-provider-detail|encryptedConfig/,
    );
  });

  it('keeps failed IMAP verification details out of the public response', async () => {
    const { repository, imapConnection, service } = createService();
    repository.findByKey.mockResolvedValue({
      encryptedConfig: encryptIntegrationConfig(
        {
          host: 'imap.example.com',
          port: 993,
          secure: true,
          user: 'inbox@example.com',
          password: 'secret-imap',
        },
        secret,
      ),
    });
    imapConnection.verify.mockRejectedValue(
      new Error('sensitive-provider-detail'),
    );
    const error = await service
      .testIncomingEmailIntegration('tenant-2')
      .catch((value) => value);
    expect(error.getStatus()).toBe(502);
    expect(JSON.stringify(error.getResponse())).not.toContain(
      'sensitive-provider-detail',
    );
    expect(repository.markTestResult).toHaveBeenCalledWith(
      'tenant-2',
      'imap',
      false,
      'sensitive-provider-detail',
    );
  });
});

describe('IMAP transport security', () => {
  it.each(['error', 'close'])(
    'rejects a late socket %s without escaping the verification promise',
    async (event) => {
      jest.useFakeTimers();
      try {
        const socket = Object.assign(new EventEmitter(), {
          setTimeout: jest.fn(),
          end: jest.fn(),
          destroy: jest.fn(),
          write: jest.fn(),
        });
        jest.mocked(connectTls).mockReturnValue(socket as never);
        const verification = new ImapConnectionService()
          .verify({
            host: 'imap.example.com',
            port: 993,
            secure: true,
            user: 'user@example.com',
            password: 'secret',
          })
          .catch((error: Error) => error);
        socket.emit('secureConnect');
        await Promise.resolve();
        let escapedError: unknown;
        try {
          socket.emit(event, new Error('connection reset'));
        } catch (error) {
          escapedError = error;
        }
        // Clean up even on the broken implementation, without a real 15s wait.
        jest.runOnlyPendingTimers();
        const error = await verification;
        expect(escapedError).toBeUndefined();
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain('no respondió a tiempo');
        expect(socket.destroy).toHaveBeenCalled();
        expect(socket.listenerCount('data')).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it.each([false, true])(
    'requires encrypted downloads when secure=%s',
    async (secure) => {
      const release = jest.fn();
      const logout = jest.fn();
      jest.mocked(ImapFlow).mockImplementation(
        () =>
          ({
            connect: jest.fn(),
            getMailboxLock: jest.fn().mockResolvedValue({ release }),
            mailbox: { exists: 0, uidValidity: 123456789n },
            logout,
            close: jest.fn(),
          }) as unknown as ImapFlow,
      );
      await expect(
        new ImapConnectionService().fetchInbox({
          host: 'imap.example.com',
          port: secure ? 993 : 143,
          secure,
          user: 'user@example.com',
          password: 'secret',
        }),
      ).resolves.toEqual({ uidValidity: '123456789', messages: [] });
      const options = jest.mocked(ImapFlow).mock.calls.at(-1)?.[0];
      expect(options).toMatchObject({
        secure,
        tls: { rejectUnauthorized: true },
        logger: false,
      });
      if (!secure) expect(options?.doSTARTTLS).toBe(true);
      else expect(options?.doSTARTTLS).not.toBe(true);
      expect(release).toHaveBeenCalled();
      expect(logout).toHaveBeenCalled();
    },
  );

  it.each([undefined, 0n])(
    'rejects an inbox without a valid UIDVALIDITY (%s)',
    async (uidValidity) => {
      const release = jest.fn();
      const logout = jest.fn();
      jest.mocked(ImapFlow).mockImplementation(
        () =>
          ({
            connect: jest.fn(),
            getMailboxLock: jest.fn().mockResolvedValue({ release }),
            mailbox: { exists: 0, uidValidity },
            logout,
            close: jest.fn(),
          }) as unknown as ImapFlow,
      );

      await expect(
        new ImapConnectionService().fetchInbox({
          host: 'imap.example.com',
          port: 993,
          secure: true,
          user: 'user@example.com',
          password: 'secret',
        }),
      ).rejects.toThrow('UIDVALIDITY');
      expect(release).toHaveBeenCalled();
      expect(logout).toHaveBeenCalled();
    },
  );
});

describe('Incoming integration validation', () => {
  const valid = {
    enabled: true,
    host: 'imap.example.com',
    port: 993,
    secure: true,
    user: 'user@example.com',
  };
  it.each(['host', 'user'])(
    'rejects a whitespace-only %s before persistence',
    async (field) => {
      const dto = plainToInstance(UpdateIncomingEmailIntegrationDto, {
        ...valid,
        [field]: '   ',
      });
      expect(
        (await validate(dto)).some((error) => error.property === field),
      ).toBe(true);
    },
  );
  it.each([0, 65536, 1.5, '993'])('rejects invalid port %s', async (port) => {
    const dto = plainToInstance(UpdateIncomingEmailIntegrationDto, {
      ...valid,
      port,
    });
    expect(
      (await validate(dto)).some((error) => error.property === 'port'),
    ).toBe(true);
  });
});

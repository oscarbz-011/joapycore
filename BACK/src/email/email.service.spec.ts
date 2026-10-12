import { ServiceUnavailableException } from '@nestjs/common';
import { ResendDeliveryError } from '../platform-email/resend.client';
import { createTransport } from 'nodemailer';
import { EmailService } from './email.service';
import { resolvePublicNetworkDestination } from '../integrations/network-destination.policy';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('../integrations/network-destination.policy', () => ({
  resolvePublicNetworkDestination: jest.fn(),
}));

describe('EmailService', () => {
  const sendMail = jest.fn();
  const verify = jest.fn();
  const close = jest.fn();
  const integrationsService = {
    getEnabledSmtpConfig: jest.fn(),
  };
  const configService = {
    get: jest.fn().mockReturnValue({
      host: 'global.example.com',
      port: 587,
      secure: false,
      user: 'global',
      password: 'secret',
      from: 'global@example.com',
    }),
  };

  const platformEmail = {
    isConfigured: jest.fn(),
    sendForTenant: jest.fn(),
    sendSystem: jest.fn(),
  };

  const input = {
    tenantId: 'tenant-1',
    to: 'cliente@example.com',
    subject: 'Contrato',
    html: '<p>Contrato</p>',
    attachment: {
      filename: 'contrato.pdf',
      content: Buffer.from('pdf'),
      contentType: 'application/pdf',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    platformEmail.isConfigured.mockReturnValue(false);
    verify.mockResolvedValue(true);
    (createTransport as jest.Mock).mockReturnValue({ sendMail, verify, close });
    jest.mocked(resolvePublicNetworkDestination).mockResolvedValue({
      address: '8.8.8.8',
      family: 4,
      servername: 'smtp.tenant.example.com',
    });
    integrationsService.getEnabledSmtpConfig.mockResolvedValue({
      host: 'smtp.tenant.example.com',
      port: 587,
      secure: false,
      user: 'tenant-user',
      password: 'tenant-secret',
      fromEmail: 'ventas@tenant.example.com',
      fromName: 'Tenant',
    });
  });

  function createService() {
    return new EmailService(
      configService as never,
      integrationsService as never,
      platformEmail as never,
    );
  }

  it('returns the real SMTP acknowledgement for the tenant message', async () => {
    sendMail.mockResolvedValue({
      messageId: 'message-123',
      accepted: ['cliente@example.com'],
      rejected: [],
    });

    await expect(createService().sendWithAttachment(input)).resolves.toEqual({
      to: 'cliente@example.com',
      messageId: 'message-123',
      accepted: ['cliente@example.com'],
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'cliente@example.com',
        attachments: [expect.objectContaining({ filename: 'contrato.pdf' })],
      }),
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '8.8.8.8',
        tls: { servername: 'smtp.tenant.example.com' },
      }),
    );
    expect(close).toHaveBeenCalled();
  });

  it('does not fall back to the global .env SMTP for a tenant without configuration', async () => {
    integrationsService.getEnabledSmtpConfig.mockResolvedValue(null);

    await expect(createService().sendWithAttachment(input)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not report success when SMTP rejects the recipient', async () => {
    sendMail.mockResolvedValue({
      messageId: 'message-rejected',
      accepted: [],
      rejected: ['cliente@example.com'],
    });

    await expect(createService().sendWithAttachment(input)).rejects.toThrow(
      'no aceptó el destinatario',
    );
    expect(close).toHaveBeenCalled();
  });

  it('classifies a lost SMTP response during tenant text delivery as ambiguous', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error('socket reset'), {
        code: 'ETIMEDOUT',
      }),
    );

    await expect(
      createService().sendTenantText({
        tenantId: 'tenant-1',
        to: 'cliente@example.com',
        subject: 'Hola',
        text: 'Mensaje',
      }),
    ).rejects.toEqual(expect.objectContaining({ ambiguous: true }));
    expect(verify).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('classifies an explicit SMTP rejection as definitive', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error('rejected'), { responseCode: 550 }),
    );

    await expect(
      createService().sendTenantText({
        tenantId: 'tenant-1',
        to: 'cliente@example.com',
        subject: 'Hola',
        text: 'Mensaje',
      }),
    ).rejects.toEqual(expect.objectContaining({ ambiguous: false }));
  });

  describe('a company that has not connected its own email', () => {
    beforeEach(() => {
      integrationsService.getEnabledSmtpConfig.mockResolvedValue(null);
      platformEmail.isConfigured.mockReturnValue(true);
      platformEmail.sendForTenant.mockResolvedValue({
        messageId: 'msg-1',
        from: 'mi-empresa@correo.joapycore.com',
      });
    });

    it('goes out through the platform sender, in the name of that company', async () => {
      const result = await createService().sendWithAttachment({
        ...input,
        purpose: 'purchase.order',
      });

      expect(platformEmail.sendForTenant).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        purpose: 'purchase.order',
        to: 'cliente@example.com',
        subject: 'Contrato',
        html: '<p>Contrato</p>',
        attachment: input.attachment,
      });
      expect(result).toEqual({
        to: 'cliente@example.com',
        messageId: 'msg-1',
        accepted: ['cliente@example.com'],
        sentFrom: 'mi-empresa@correo.joapycore.com',
      });
      // Nunca por el SMTP global, que no dice de qué empresa es el correo.
      expect(createTransport).not.toHaveBeenCalled();
    });

    it('still fails clearly when the platform sender is off', async () => {
      platformEmail.isConfigured.mockReturnValue(false);

      await expect(createService().sendWithAttachment(input)).rejects.toThrow(
        /no está configurado/,
      );
      expect(platformEmail.sendForTenant).not.toHaveBeenCalled();
    });

    it('does not claim a failure when the outcome is unknown', async () => {
      platformEmail.sendForTenant.mockRejectedValue(
        new ResendDeliveryError('PROVIDER_UNREACHABLE', true, true, 'x'),
      );

      await expect(createService().sendWithAttachment(input)).rejects.toThrow(
        /No se pudo confirmar/,
      );
    });

    it('prefers the company email once it is connected', async () => {
      integrationsService.getEnabledSmtpConfig.mockResolvedValue({
        host: 'smtp.tenant.example.com',
        port: 587,
        secure: false,
        fromEmail: 'ventas@tenant.example.com',
      });
      sendMail.mockResolvedValue({
        messageId: 'smtp-1',
        accepted: ['cliente@example.com'],
        rejected: [],
      });

      await createService().sendWithAttachment(input);

      expect(platformEmail.sendForTenant).not.toHaveBeenCalled();
    });
  });

  it("sends the platform's own emails through its sender", async () => {
    platformEmail.isConfigured.mockReturnValue(true);
    platformEmail.sendSystem.mockResolvedValue({
      messageId: 'msg-2',
      from: 'no-reply@correo.joapycore.com',
    });

    await createService().sendWithAttachment({ ...input, tenantId: undefined });

    expect(platformEmail.sendSystem).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'system', to: 'cliente@example.com' }),
    );
    expect(platformEmail.sendForTenant).not.toHaveBeenCalled();
  });
});

import { ServiceUnavailableException } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('EmailService', () => {
  const sendMail = jest.fn();
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
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close });
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
});

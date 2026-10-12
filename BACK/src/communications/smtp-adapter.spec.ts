import { createTransport } from 'nodemailer';
import { PlatformEmailLimitError } from '../platform-email/platform-email.service';
import { ResendDeliveryError } from '../platform-email/resend.client';
import { IntegrationsService } from '../integrations/integrations.service';
import { resolvePublicNetworkDestination } from '../integrations/network-destination.policy';
import {
  CommunicationsEmailProvider,
  type TransactionalEmail,
} from './communications-email.provider';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('../integrations/network-destination.policy', () => ({
  resolvePublicNetworkDestination: jest.fn(),
}));

describe('Tenant SMTP adapter', () => {
  const input: TransactionalEmail = {
    tenantId: 'tenant-a',
    messageId: '<stable@example.test>',
    recipient: 'customer@example.test',
    fromEmail: 'no-reply@example.test',
    fromName: 'Mi empresa',
    replyTo: 'sales@example.test',
    subject: 'Factura',
    bodyText: 'Documento adjunto',
    attachment: {
      filename: 'factura.pdf',
      content: Buffer.from('pdf'),
      contentType: 'application/pdf',
    },
  };
  const transport = {
    verify: jest.fn(),
    sendMail: jest.fn(),
    close: jest.fn(),
  };
  const integrations = { getEnabledSmtpConfig: jest.fn() };
  const platformEmail = { isConfigured: jest.fn(), sendForTenant: jest.fn() };
  let provider: CommunicationsEmailProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    platformEmail.isConfigured.mockReturnValue(false);
    integrations.getEnabledSmtpConfig.mockResolvedValue({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      user: 'tenant-login',
      password: 'never-log-this',
      fromEmail: input.fromEmail,
    });
    transport.verify.mockResolvedValue(true);
    transport.sendMail.mockResolvedValue({
      accepted: [input.recipient],
      messageId: input.messageId,
    });
    (createTransport as jest.Mock).mockReturnValue(transport);
    jest.mocked(resolvePublicNetworkDestination).mockResolvedValue({
      address: '8.8.8.8',
      family: 4,
      servername: 'smtp.example.test',
    });
    provider = new CommunicationsEmailProvider(
      integrations as unknown as IntegrationsService,
      platformEmail as never,
    );
  });

  it('sends the pinned attachment with Reply-To, stable Message-ID and text-only content', async () => {
    expect(await provider.send(input)).toEqual({ messageId: input.messageId });
    expect(integrations.getEnabledSmtpConfig).toHaveBeenCalledWith('tenant-a');
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '8.8.8.8',
        tls: { servername: 'smtp.example.test' },
      }),
    );
    expect(transport.sendMail).toHaveBeenCalledWith({
      messageId: input.messageId,
      from: { name: 'Mi empresa', address: input.fromEmail },
      replyTo: input.replyTo,
      to: input.recipient,
      subject: input.subject,
      text: input.bodyText,
      attachments: [input.attachment],
    });
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsafe destination before creating a transport', async () => {
    jest
      .mocked(resolvePublicNetworkDestination)
      .mockRejectedValueOnce(new Error('private destination'));

    await expect(provider.send(input)).rejects.toMatchObject({
      code: 'SMTP_UNAVAILABLE',
      ambiguous: false,
    });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('does not use global SMTP when a tenant has no enabled connection', async () => {
    integrations.getEnabledSmtpConfig.mockResolvedValue(null);
    await expect(provider.send(input)).rejects.toMatchObject({
      code: 'SMTP_NOT_CONFIGURED',
      ambiguous: false,
    });
    expect(createTransport).not.toHaveBeenCalled();
  });

  describe('a tenant without its own SMTP, with the platform sender on', () => {
    beforeEach(() => {
      integrations.getEnabledSmtpConfig.mockResolvedValue(null);
      platformEmail.isConfigured.mockReturnValue(true);
      platformEmail.sendForTenant.mockResolvedValue({
        messageId: 'resend-1',
        from: 'mi-empresa@correo.joapycore.com',
      });
    });

    it('sends the invoice through the platform, replies to the identity', async () => {
      await expect(provider.send(input)).resolves.toEqual({
        messageId: 'resend-1',
      });

      expect(platformEmail.sendForTenant).toHaveBeenCalledWith({
        tenantId: input.tenantId,
        purpose: 'invoice',
        to: input.recipient,
        subject: input.subject,
        text: input.bodyText,
        attachment: input.attachment,
        replyTo: input.replyTo ?? input.fromEmail,
        idempotencyKey: `communication-${input.messageId}`,
      });
      expect(createTransport).not.toHaveBeenCalled();
    });

    it('keeps the outcome unknown when the provider never answered', async () => {
      platformEmail.sendForTenant.mockRejectedValue(
        new ResendDeliveryError('PROVIDER_UNREACHABLE', true, true, 'x'),
      );

      await expect(provider.send(input)).rejects.toMatchObject({
        code: 'PROVIDER_UNREACHABLE',
        ambiguous: true,
      });
    });

    it('reports the daily limit as a definite failure', async () => {
      platformEmail.sendForTenant.mockRejectedValue(
        new PlatformEmailLimitError(200),
      );

      await expect(provider.send(input)).rejects.toMatchObject({
        code: 'PLATFORM_DAILY_LIMIT',
        ambiguous: false,
      });
    });
  });

  it('rejects an identity if the tenant SMTP sender changed', async () => {
    await expect(
      provider.send({ ...input, fromEmail: 'spoof@example.test' }),
    ).rejects.toMatchObject({ code: 'SENDER_CHANGED' });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('never sends when connection verification fails', async () => {
    transport.verify.mockRejectedValue(new Error('never-log-this'));
    await expect(provider.send(input)).rejects.toMatchObject({
      code: 'SMTP_UNAVAILABLE',
      ambiguous: false,
    });
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  it('marks uncertain sending errors without retaining the provider response', async () => {
    transport.sendMail.mockRejectedValue(
      new Error('private body and credentials'),
    );
    await expect(provider.send(input)).rejects.toMatchObject({
      code: 'SMTP_OUTCOME_UNKNOWN',
      ambiguous: true,
    });
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  it('does not report SENT for a rejected recipient', async () => {
    transport.sendMail.mockResolvedValue({
      accepted: [],
      rejected: [input.recipient],
    });
    await expect(provider.send(input)).rejects.toMatchObject({
      code: 'RECIPIENT_REJECTED',
      ambiguous: false,
    });
  });
});

import { createTransport } from 'nodemailer';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  CommunicationsEmailProvider,
  type TransactionalEmail,
} from './communications-email.provider';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

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
  let provider: CommunicationsEmailProvider;

  beforeEach(() => {
    jest.clearAllMocks();
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
    provider = new CommunicationsEmailProvider(
      integrations as unknown as IntegrationsService,
    );
  });

  it('sends the pinned attachment with Reply-To, stable Message-ID and text-only content', async () => {
    expect(await provider.send(input)).toEqual({ messageId: input.messageId });
    expect(integrations.getEnabledSmtpConfig).toHaveBeenCalledWith('tenant-a');
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

  it('does not use global SMTP when a tenant has no enabled connection', async () => {
    integrations.getEnabledSmtpConfig.mockResolvedValue(null);
    await expect(provider.send(input)).rejects.toMatchObject({
      code: 'SMTP_NOT_CONFIGURED',
      ambiguous: false,
    });
    expect(createTransport).not.toHaveBeenCalled();
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

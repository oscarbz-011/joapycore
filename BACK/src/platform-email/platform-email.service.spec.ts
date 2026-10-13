import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  PlatformEmailLimitError,
  PlatformEmailService,
} from './platform-email.service';
import { PlatformDeliveryError } from './platform-delivery';

const config = {
  driver: 'resend' as 'resend' | 'smtp',
  apiKey: 're_key',
  domain: 'correo.joapycore.com',
  brand: 'JoapyCore',
  systemLocalPart: 'no-reply',
  tenantDailyLimit: 200,
};

const smtpConfig = {
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  user: 'avisos@joapycore.com',
  password: 'secret',
  from: 'JoapyCore <avisos@joapycore.com>',
};

const tenant = {
  id: 'tenant-1',
  name: 'Mi Empresa SA',
  nombreFantasia: 'Mi Empresa',
  email: 'Ventas@MiEmpresa.com',
};

const order = {
  tenantId: 'tenant-1',
  purpose: 'purchase.order',
  to: 'proveedor@example.com',
  subject: 'Orden de compra OC-1',
  html: '<p>Adjuntamos la orden.</p>',
  attachment: {
    filename: 'orden.pdf',
    content: Buffer.from('PDF'),
    contentType: 'application/pdf',
  },
};

describe('PlatformEmailService', () => {
  let service: PlatformEmailService;
  let current: Partial<typeof config>;
  let repository: {
    findTenant: jest.Mock;
    countRecent: jest.Mock;
    record: jest.Mock;
  };
  let resend: { send: jest.Mock };
  let smtp: { send: jest.Mock };
  let currentSmtp: Partial<typeof smtpConfig>;

  beforeEach(() => {
    current = { ...config };
    repository = {
      findTenant: jest.fn().mockResolvedValue(tenant),
      countRecent: jest.fn().mockResolvedValue(0),
      record: jest.fn().mockResolvedValue({ id: 'log-1' }),
    };
    resend = { send: jest.fn().mockResolvedValue({ id: 'msg-1' }) };
    smtp = { send: jest.fn().mockResolvedValue({ id: '<smtp-1>' }) };
    currentSmtp = { ...smtpConfig };
    service = new PlatformEmailService(
      {
        get: (key: string) => (key === 'email' ? currentSmtp : current),
      } as never,
      repository as never,
      resend,
      smtp,
    );
  });

  describe('sendForTenant', () => {
    it('sends in the name of the company, with replies going to its own address', async () => {
      const result = await service.sendForTenant(order);

      expect(resend.send).toHaveBeenCalledWith(
        're_key',
        expect.objectContaining({
          from: '"Mi Empresa vía JoapyCore" <mi-empresa@correo.joapycore.com>',
          to: 'proveedor@example.com',
          replyTo: 'ventas@miempresa.com',
          attachments: [order.attachment],
          tags: [
            { name: 'purpose', value: 'purchase_order' },
            { name: 'tenant_id', value: 'tenant-1' },
          ],
        }),
        expect.any(String),
      );
      expect(result).toEqual({
        messageId: 'msg-1',
        from: 'mi-empresa@correo.joapycore.com',
      });
    });

    it('keeps a record of what went out, without the body', async () => {
      await service.sendForTenant(order);

      expect(repository.record).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        purpose: 'purchase.order',
        recipient: 'proveedor@example.com',
        subject: 'Orden de compra OC-1',
        fromAddress: 'mi-empresa@correo.joapycore.com',
        replyTo: 'ventas@miempresa.com',
        status: 'SENT',
        providerMessageId: 'msg-1',
      });
    });

    it('lets the caller choose where replies go', async () => {
      await service.sendForTenant({
        ...order,
        replyTo: 'compras@miempresa.com',
      });

      expect(resend.send.mock.calls[0][1].replyTo).toBe(
        'compras@miempresa.com',
      );
    });

    // Sin correo cargado, las respuestas no tienen a dónde ir: sale sin "responder a".
    it('sends without a reply address when the company has none', async () => {
      repository.findTenant.mockResolvedValue({ ...tenant, email: null });

      await service.sendForTenant(order);

      expect(resend.send.mock.calls[0][1].replyTo).toBeUndefined();
    });

    it('uses the same idempotency key on a retry', async () => {
      await service.sendForTenant({ ...order, idempotencyKey: 'comm-1' });

      expect(resend.send.mock.calls[0][2]).toBe('comm-1');
    });

    // El dominio es compartido: una empresa no puede gastar la reputación de todas.
    it('stops a company that reached its daily limit', async () => {
      repository.countRecent.mockResolvedValue(200);

      await expect(service.sendForTenant(order)).rejects.toBeInstanceOf(
        PlatformEmailLimitError,
      );
      expect(repository.countRecent).toHaveBeenCalledWith('tenant-1');
      expect(resend.send).not.toHaveBeenCalled();
    });

    it('does not send for a company that does not exist', async () => {
      repository.findTenant.mockResolvedValue(null);

      await expect(service.sendForTenant(order)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(resend.send).not.toHaveBeenCalled();
    });

    it('records a rejection as failed and an unanswered request as unknown', async () => {
      resend.send.mockRejectedValue(
        new PlatformDeliveryError('PROVIDER_INVALID', false, false, 'x'),
      );
      await expect(service.sendForTenant(order)).rejects.toBeInstanceOf(
        PlatformDeliveryError,
      );
      expect(repository.record).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'FAILED',
          errorCode: 'PROVIDER_INVALID',
        }),
      );

      resend.send.mockRejectedValue(
        new PlatformDeliveryError('PROVIDER_UNREACHABLE', true, true, 'x'),
      );
      await expect(service.sendForTenant(order)).rejects.toBeInstanceOf(
        PlatformDeliveryError,
      );
      expect(repository.record).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'UNKNOWN' }),
      );
    });

    it('refuses to send when the platform sender is not set up', async () => {
      current.apiKey = undefined;

      expect(service.isConfigured()).toBe(false);
      await expect(service.sendForTenant(order)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(resend.send).not.toHaveBeenCalled();
    });
  });

  describe('sendSystem', () => {
    it('sends as the platform itself, tied to no company', async () => {
      await service.sendSystem({
        purpose: 'system.password_reset',
        to: 'usuario@example.com',
        subject: 'Recuperá tu contraseña',
        html: '<p>…</p>',
      });

      expect(resend.send.mock.calls[0][1]).toMatchObject({
        from: '"JoapyCore" <no-reply@correo.joapycore.com>',
        replyTo: undefined,
        tags: [{ name: 'purpose', value: 'system_password_reset' }],
      });
      expect(repository.record).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: null, status: 'SENT' }),
      );
      expect(repository.countRecent).not.toHaveBeenCalled();
    });
  });

  describe('senderFor', () => {
    it('tells a company how its emails would go out and what it has left', async () => {
      repository.countRecent.mockResolvedValue(12);

      await expect(service.senderFor('tenant-1')).resolves.toEqual({
        available: true,
        fromAddress: 'mi-empresa@correo.joapycore.com',
        fromName: 'Mi Empresa vía JoapyCore',
        replyTo: 'ventas@miempresa.com',
        dailyLimit: 200,
        sentToday: 12,
        remainingToday: 188,
      });
    });

    it('says so when the platform sender is not set up', async () => {
      current.domain = undefined;

      await expect(service.senderFor('tenant-1')).resolves.toEqual({
        available: false,
      });
      expect(repository.findTenant).not.toHaveBeenCalled();
    });
  });

  // Un servidor SMTP (Zoho, Gmail…) solo deja enviar desde su propia dirección.
  describe('through the SMTP server of the environment', () => {
    beforeEach(() => {
      current = {
        ...config,
        driver: 'smtp',
        apiKey: undefined,
        domain: undefined,
      };
    });

    it('sends every company from the one address, told apart by name and reply address', async () => {
      const result = await service.sendForTenant(order);

      expect(smtp.send).toHaveBeenCalledWith(
        currentSmtp,
        'avisos@joapycore.com',
        expect.objectContaining({
          from: '"Mi Empresa vía JoapyCore" <avisos@joapycore.com>',
          to: 'proveedor@example.com',
          replyTo: 'ventas@miempresa.com',
          attachments: [order.attachment],
        }),
        expect.any(String),
      );
      expect(resend.send).not.toHaveBeenCalled();
      expect(result).toEqual({
        messageId: '<smtp-1>',
        from: 'avisos@joapycore.com',
      });
      expect(repository.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          fromAddress: 'avisos@joapycore.com',
          status: 'SENT',
        }),
      );
    });

    it('sends the emails of the platform itself under its brand', async () => {
      await service.sendSystem({
        purpose: 'system.password_reset',
        to: 'usuario@example.com',
        subject: 'Recuperá tu contraseña',
        html: '<p>…</p>',
      });

      expect(smtp.send.mock.calls[0][2]).toMatchObject({
        from: '"JoapyCore" <avisos@joapycore.com>',
        replyTo: undefined,
      });
    });

    it('keeps the daily cap of each company', async () => {
      repository.countRecent.mockResolvedValue(200);

      await expect(service.sendForTenant(order)).rejects.toBeInstanceOf(
        PlatformEmailLimitError,
      );
      expect(smtp.send).not.toHaveBeenCalled();
    });

    it('tells a company the address its emails go out from', async () => {
      await expect(service.senderFor('tenant-1')).resolves.toMatchObject({
        available: true,
        fromAddress: 'avisos@joapycore.com',
        fromName: 'Mi Empresa vía JoapyCore',
        replyTo: 'ventas@miempresa.com',
      });
    });

    it('is off without a server or without an address to send from', async () => {
      currentSmtp.host = undefined;
      expect(service.isConfigured()).toBe(false);

      currentSmtp = { ...smtpConfig, from: 'JoapyCore' };
      expect(service.isConfigured()).toBe(false);
      await expect(service.sendForTenant(order)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    // Tener la clave de Resend cargada no cambia por dónde se eligió salir.
    it('does not fall back to Resend', async () => {
      current.apiKey = 're_key';
      current.domain = 'correo.joapycore.com';

      await service.sendForTenant(order);

      expect(resend.send).not.toHaveBeenCalled();
      expect(smtp.send).toHaveBeenCalled();
    });
  });
});

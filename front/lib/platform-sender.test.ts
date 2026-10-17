import { describe, expect, it } from 'vitest';
import { senderNotice, type PlatformSender } from './platform-sender';

const sender: PlatformSender = {
  available: true,
  fromAddress: 'mi-empresa@correo.joapycore.com',
  fromName: 'Mi Empresa vía JoapyCore',
  replyTo: 'ventas@miempresa.com',
  dailyLimit: 200,
  sentToday: 12,
  remainingToday: 188,
};

describe('senderNotice', () => {
  it('says nothing once the company sends with its own email', () => {
    expect(senderNotice(sender, true)).toBeNull();
  });

  it('says nothing while the answer has not arrived', () => {
    expect(senderNotice(undefined, false)).toBeNull();
  });

  it('explains that emails go out through the platform, and where replies land', () => {
    const notice = senderNotice(sender, false);

    expect(notice?.tone).toBe('info');
    expect(notice?.title).toBe('Estás enviando por el remitente de JoapyCore');
    expect(notice?.lines).toEqual([
      'Tus correos salen como Mi Empresa vía JoapyCore <mi-empresa@correo.joapycore.com>.',
      'Las respuestas llegan a ventas@miempresa.com.',
      'Enviaste 12 de 200 correos en las últimas 24 horas.',
      'Conectá el correo de la empresa para enviar desde tu propia dirección y sin ese tope.',
    ]);
  });

  // Sin correo cargado, el cliente que responde le escribe a nadie.
  it('warns when replies have nowhere to go', () => {
    const notice = senderNotice({ ...sender, replyTo: null }, false);

    expect(notice?.tone).toBe('warning');
    expect(notice?.lines[1]).toMatch(/no llegan a ningún lado/);
  });

  it('warns when the daily limit is used up', () => {
    const notice = senderNotice({ ...sender, sentToday: 200, remainingToday: 0 }, false);

    expect(notice?.tone).toBe('warning');
    expect(notice?.lines[2]).toBe(
      'Ya usaste los 200 correos de las últimas 24 horas por este remitente.',
    );
  });

  it('warns that nothing can be sent when the platform sender is off too', () => {
    const notice = senderNotice({ available: false }, false);

    expect(notice?.tone).toBe('warning');
    expect(notice?.title).toBe('Todavía no hay un correo conectado');
  });
});

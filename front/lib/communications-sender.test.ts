import { describe, expect, it } from 'vitest';
import { senderExplanation } from './communications-sender';

describe('senderExplanation', () => {
  // La contradicción que se corrige: sin correo propio no hay que crear nada.
  it('tells a company without its own email that invoices go out anyway', () => {
    const explanation = senderExplanation({
      via: 'platform',
      fromEmail: 'ferro-sa@correo.joapycore.com',
      fromName: 'Ferro SA vía JoapyCore',
      replyTo: 'ventas@ferro.com',
    });

    expect(explanation.tone).toBe('info');
    expect(explanation.title).toMatch(/salen igual/);
    expect(explanation.lines).toContain('Salen como Ferro SA vía JoapyCore <ferro-sa@correo.joapycore.com>.');
    expect(explanation.lines).toContain('Las respuestas llegan a ventas@ferro.com.');
    expect(explanation.lines.join(' ')).toMatch(/No hace falta definir una identidad/);
    expect(explanation.canDefineIdentity).toBe(false);
  });

  it('warns when the answers would reach nobody', () => {
    const explanation = senderExplanation({
      via: 'platform',
      fromEmail: 'ferro-sa@correo.joapycore.com',
      fromName: 'Ferro SA vía JoapyCore',
      replyTo: null,
    });

    expect(explanation.tone).toBe('warning');
    expect(explanation.lines.join(' ')).toMatch(/no llegan a ningún lado/);
  });

  it('says an identity is optional once the company connected its email', () => {
    const explanation = senderExplanation({
      via: 'smtp',
      fromEmail: 'ventas@ferro.com',
      fromName: null,
      replyTo: null,
    });

    expect(explanation.lines).toContain('Salen como ventas@ferro.com.');
    expect(explanation.lines.join(' ')).toMatch(/identidad es opcional/);
    expect(explanation.canDefineIdentity).toBe(true);
  });

  it('describes the identity the company defined', () => {
    const explanation = senderExplanation({
      via: 'identity',
      fromEmail: 'facturas@ferro.com',
      fromName: 'Ferro SA',
      replyTo: 'cobranzas@ferro.com',
    });

    expect(explanation.lines).toEqual([
      'Salen como Ferro SA <facturas@ferro.com>.',
      'Las respuestas llegan a cobranzas@ferro.com.',
    ]);
    expect(explanation.canDefineIdentity).toBe(true);
  });

  it('warns when nothing can go out', () => {
    const explanation = senderExplanation({ via: 'none' });

    expect(explanation.tone).toBe('warning');
    expect(explanation.canDefineIdentity).toBe(false);
  });
});

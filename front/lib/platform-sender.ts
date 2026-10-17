// Qué decirle a la empresa sobre desde dónde salen sus correos cuando todavía
// no conectó el suyo: por el remitente de JoapyCore, o por ningún lado.

export type PlatformSender =
  | { available: false }
  | {
      available: true;
      fromAddress: string;
      fromName: string;
      /** A dónde llegan las respuestas; null si la empresa no cargó su correo. */
      replyTo: string | null;
      dailyLimit: number;
      sentToday: number;
      remainingToday: number;
    };

export interface SenderNotice {
  /** `warning` = hay algo que la empresa tiene que resolver. */
  tone: 'info' | 'warning';
  title: string;
  lines: string[];
}

/**
 * El aviso de la pantalla de correo. Null cuando la empresa ya envía con su
 * propio correo: ahí no hay nada que explicar.
 */
export function senderNotice(
  sender: PlatformSender | undefined,
  ownEmailEnabled: boolean,
): SenderNotice | null {
  if (ownEmailEnabled || !sender) return null;

  if (!sender.available) {
    return {
      tone: 'warning',
      title: 'Todavía no hay un correo conectado',
      lines: [
        'Las facturas, los documentos y las órdenes de compra no se pueden enviar por correo hasta que conectes el correo de la empresa.',
      ],
    };
  }

  const lines = [
    `Tus correos salen como ${sender.fromName} <${sender.fromAddress}>.`,
    sender.replyTo
      ? `Las respuestas llegan a ${sender.replyTo}.`
      : 'Las respuestas no llegan a ningún lado: cargá el correo de la empresa en Datos de la empresa.',
    sender.remainingToday === 0
      ? `Ya usaste los ${sender.dailyLimit} correos de las últimas 24 horas por este remitente.`
      : `Enviaste ${sender.sentToday} de ${sender.dailyLimit} correos en las últimas 24 horas.`,
    'Conectá el correo de la empresa para enviar desde tu propia dirección y sin ese tope.',
  ];
  return {
    tone: sender.replyTo && sender.remainingToday > 0 ? 'info' : 'warning',
    title: 'Estás enviando por el remitente de JoapyCore',
    lines,
  };
}

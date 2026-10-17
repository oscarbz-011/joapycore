import type { CommunicationSender } from './api/communications';
import type { SenderNotice } from './platform-sender';

export interface SenderExplanation extends SenderNotice {
  /** Una identidad es una dirección propia: hace falta tener el correo conectado. */
  canDefineIdentity: boolean;
}

const sentAs = (sender: { fromEmail: string; fromName: string | null }) =>
  sender.fromName ? `${sender.fromName} <${sender.fromEmail}>` : sender.fromEmail;

/** Desde dónde salen los correos de la empresa, dicho para quien la administra. */
export function senderExplanation(sender: CommunicationSender): SenderExplanation {
  if (sender.via === 'none') {
    return {
      tone: 'warning',
      title: 'Los correos no pueden salir todavía',
      lines: ['Conectá el correo de la empresa en Integraciones para empezar a enviar.'],
      canDefineIdentity: false,
    };
  }
  if (sender.via === 'platform') {
    return {
      tone: sender.replyTo ? 'info' : 'warning',
      title: 'Tu empresa todavía no conectó su correo: las facturas salen igual',
      lines: [
        `Salen como ${sentAs(sender)}.`,
        sender.replyTo
          ? `Las respuestas llegan a ${sender.replyTo}.`
          : 'Las respuestas no llegan a ningún lado: cargá el correo de la empresa en Datos de la empresa.',
        'No hace falta definir una identidad. Para enviar desde tu propia dirección, conectá el correo de la empresa en Integraciones.',
      ],
      canDefineIdentity: false,
    };
  }
  if (sender.via === 'smtp') {
    return {
      tone: 'info',
      title: 'Las facturas salen desde el correo conectado de tu empresa',
      lines: [
        `Salen como ${sentAs(sender)}.`,
        'Una identidad es opcional: sirve para cambiar el nombre visible o a quién se responde.',
      ],
      canDefineIdentity: true,
    };
  }
  return {
    tone: 'info',
    title: 'Las facturas salen con la identidad predeterminada',
    lines: [
      `Salen como ${sentAs(sender)}.`,
      ...(sender.replyTo ? [`Las respuestas llegan a ${sender.replyTo}.`] : []),
    ],
    canDefineIdentity: true,
  };
}

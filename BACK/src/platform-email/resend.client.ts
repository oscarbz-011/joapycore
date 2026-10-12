import { Injectable } from '@nestjs/common';

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 20_000;

export interface ResendEmail {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
  tags?: { name: string; value: string }[];
}

/**
 * Por qué no salió un correo. `ambiguous` = no se sabe si el proveedor lo
 * aceptó (corte de red, error del servidor): reintentar con la misma clave de
 * idempotencia es seguro; avisarle al usuario que "falló" no lo es.
 */
export class ResendDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly ambiguous: boolean,
    /** Vale la pena reintentar más tarde (límite de velocidad, caída). */
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

// El detalle del proveedor puede nombrar la clave o la cuenta: al usuario se
// le muestra un texto propio por tipo de error.
const REJECTIONS: Record<number, [code: string, message: string]> = {
  401: ['PROVIDER_AUTH', 'El servicio de correo rechazó las credenciales.'],
  403: [
    'PROVIDER_FORBIDDEN',
    'El servicio de correo no acepta envíos desde este dominio.',
  ],
  422: ['PROVIDER_INVALID', 'El servicio de correo rechazó el mensaje.'],
};

/** Envío por la API de Resend. Un solo intento; reintentar es de quien llama. */
@Injectable()
export class ResendClient {
  async send(
    apiKey: string,
    email: ResendEmail,
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey.slice(0, 256),
        },
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          reply_to: email.replyTo,
          attachments: email.attachments?.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content.toString('base64'),
            content_type: attachment.contentType,
          })),
          tags: email.tags,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Corte o tiempo agotado: el pedido pudo haber llegado.
      throw new ResendDeliveryError(
        'PROVIDER_UNREACHABLE',
        true,
        true,
        'No hubo respuesta del servicio de correo.',
      );
    }

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as {
        id?: unknown;
      } | null;
      if (typeof body?.id === 'string') return { id: body.id };
      throw new ResendDeliveryError(
        'PROVIDER_UNEXPECTED',
        true,
        false,
        'El servicio de correo respondió algo inesperado.',
      );
    }

    if (response.status === 429) {
      throw new ResendDeliveryError(
        'PROVIDER_LIMIT',
        false,
        true,
        'El servicio de correo alcanzó su límite. Se reintentará más tarde.',
      );
    }
    if (response.status === 409) {
      // La misma clave todavía se está procesando, o ya se usó con otro cuerpo.
      throw new ResendDeliveryError(
        'PROVIDER_DUPLICATE',
        true,
        true,
        'Ya hay un envío igual en curso.',
      );
    }
    if (response.status >= 500) {
      throw new ResendDeliveryError(
        'PROVIDER_ERROR',
        true,
        true,
        'El servicio de correo tuvo un error.',
      );
    }
    const [code, message] = REJECTIONS[response.status] ?? [
      'PROVIDER_REJECTED',
      'El servicio de correo rechazó el envío.',
    ];
    throw new ResendDeliveryError(code, false, false, message);
  }
}

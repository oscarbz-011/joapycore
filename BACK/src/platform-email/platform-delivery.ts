export interface PlatformOutgoingEmail {
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
export class PlatformDeliveryError extends Error {
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

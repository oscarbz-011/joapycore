// Reglas puras del remitente de la plataforma.

const FALLBACK_LOCAL_PART = 'empresa';
const MAX_LOCAL_PART = 48;

/**
 * La parte local de la dirección con que sale una empresa: su nombre en
 * minúsculas, sin acentos ni símbolos. "Ferretería El Tornillo S.R.L." →
 * "ferreteria-el-tornillo-s-r-l". Dos empresas con el mismo nombre comparten
 * dirección: no molesta, porque las respuestas van al correo de cada una.
 */
export function tenantLocalPart(tenantName: string): string {
  const slug = tenantName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LOCAL_PART)
    .replace(/-+$/g, '');
  return slug || FALLBACK_LOCAL_PART;
}

// Un nombre para mostrar no puede cortar el encabezado ni cerrar las comillas.
const displayName = (name: string) =>
  name
    .replace(/[\r\n"<>\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** `"Mi Empresa vía JoapyCore" <mi-empresa@correo.joapycore.com>` */
export function tenantSender(
  tenantName: string,
  brand: string,
  domain: string,
): { address: string; name: string; header: string } {
  return sharedSender(
    `${tenantLocalPart(tenantName)}@${domain}`,
    tenantSenderName(tenantName, brand),
  );
}

/** "Mi Empresa vía JoapyCore" */
export function tenantSenderName(tenantName: string, brand: string): string {
  const shown = displayName(tenantName);
  return shown ? `${shown} vía ${brand}` : brand;
}

/** Una dirección fija con el nombre que corresponda a quien envía. */
export function sharedSender(
  address: string,
  name: string,
): { address: string; name: string; header: string } {
  const shown = displayName(name);
  return { address, name: shown, header: `"${shown}" <${address}>` };
}

/** La dirección de un remitente escrito como `a@b.c` o `Nombre <a@b.c>`. */
export function addressOf(from: string | undefined): string | null {
  const bracketed = from?.match(/<([^<>]+)>\s*$/)?.[1];
  return replyAddress(bracketed ?? from);
}

/** `"JoapyCore" <no-reply@correo.joapycore.com>` */
export function systemSender(
  brand: string,
  localPart: string,
  domain: string,
): { address: string; name: string; header: string } {
  return sharedSender(`${localPart}@${domain}`, brand);
}

const EMAIL = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;

/** La dirección limpia, o null si no sirve para responder. */
export function replyAddress(value: string | null | undefined): string | null {
  const address = value?.trim().toLowerCase();
  return address && EMAIL.test(address) ? address : null;
}

/** Cuántos correos le quedan a la empresa en la ventana de 24 horas. */
export function remainingToday(sent: number, dailyLimit: number): number {
  return Math.max(0, dailyLimit - sent);
}

/** Las etiquetas de Resend solo admiten letras, números, guiones y guion bajo. */
export function resendTag(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);
}

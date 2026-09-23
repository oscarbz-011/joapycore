import { BadRequestException } from '@nestjs/common';

export const INVOICE_TEMPLATE_CODE = 'INVOICE_ISSUED';
export const INVOICE_TEMPLATE_VARIABLES = [
  'invoice.number',
  'invoice.total',
  'invoice.issuedAt',
  'invoice.dueDate',
  'customer.name',
  'tenant.name',
] as const;

/** Plain text interpolation only: no JavaScript, HTML, helpers or expressions. */
export function renderInvoiceTemplate(
  subject: string,
  bodyText: string,
  variables: Record<string, string>,
): { subject: string; bodyText: string } {
  const render = (source: string) => {
    const rendered = source.replace(
      /{{\s*([^{}]+?)\s*}}/g,
      (_, raw: string) => {
        const name = raw.trim();
        if (
          !(INVOICE_TEMPLATE_VARIABLES as readonly string[]).includes(name) ||
          !Object.prototype.hasOwnProperty.call(variables, name)
        ) {
          throw new BadRequestException(
            `Variable de plantilla no permitida: ${name}`,
          );
        }
        return variables[name];
      },
    );
    if (rendered.includes('{{') || rendered.includes('}}')) {
      throw new BadRequestException(
        'La plantilla contiene una variable incompleta',
      );
    }
    return rendered;
  };
  const result = { subject: render(subject), bodyText: render(bodyText) };
  if (
    !result.subject.trim() ||
    /[\r\n]/.test(result.subject) ||
    result.subject.length > 300
  ) {
    throw new BadRequestException(
      'El asunto debe tener entre 1 y 300 caracteres, sin saltos de línea',
    );
  }
  if (!result.bodyText.trim() || result.bodyText.length > 100_000) {
    throw new BadRequestException(
      'El cuerpo debe tener entre 1 y 100000 caracteres',
    );
  }
  return result;
}

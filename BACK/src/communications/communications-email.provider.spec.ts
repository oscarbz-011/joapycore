import { classifySmtpFailure } from './communications-email.provider';
import { renderInvoiceTemplate } from './communications-template';

describe('SMTP outcome classification', () => {
  it('does not retry a lost response after sending', () => {
    expect(
      classifySmtpFailure(
        { code: 'ETIMEDOUT', message: 'password=secret' },
        true,
      ),
    ).toMatchObject({ ambiguous: true, code: 'SMTP_OUTCOME_UNKNOWN' });
  });
  it('permits a retry for explicit rejection or connection failure before sending', () => {
    expect(classifySmtpFailure({ responseCode: 550 }, true).ambiguous).toBe(
      false,
    );
    expect(classifySmtpFailure({ code: 'EAUTH' }, false).ambiguous).toBe(false);
    expect(
      classifySmtpFailure({ message: 'secret' }, false).message,
    ).not.toContain('secret');
  });
});

describe('Versioned invoice templates', () => {
  it('renders only allowed variables as plain text', () => {
    expect(
      renderInvoiceTemplate(
        'Factura {{invoice.number}}',
        'Hola {{customer.name}}',
        { 'invoice.number': '001', 'customer.name': '<b>Ana</b>' },
      ),
    ).toEqual({ subject: 'Factura 001', bodyText: 'Hola <b>Ana</b>' });
  });
  it.each([
    '{{constructor}}',
    '{{tenant.password}}',
    '{{invoice.number',
    '{{eval()}}',
  ])('rejects invalid variable %s', (body) => {
    expect(() => renderInvoiceTemplate('Factura', body, {})).toThrow();
  });
  it('rejects header injection originating in business data', () => {
    expect(() =>
      renderInvoiceTemplate('{{customer.name}}', 'Factura', {
        'customer.name': 'Ana\r\nBcc: victim@example.test',
      }),
    ).toThrow();
  });
});

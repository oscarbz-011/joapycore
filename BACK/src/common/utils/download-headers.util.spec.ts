import { contentDisposition, downloadHeaders } from './download-headers.util';

describe('downloadHeaders', () => {
  it.each(['application/pdf', 'image/png', 'IMAGE/JPEG; charset=binary'])(
    'serves %s inline with its own type',
    (mime) => {
      const h = downloadHeaders(mime, 'x');
      expect(h.contentDisposition.startsWith('inline;')).toBe(true);
      expect(h.contentType).toBe(mime.split(';')[0].toLowerCase());
    },
  );

  it.each([
    'text/html',
    'image/svg+xml',
    'application/xhtml+xml',
    'text/javascript',
    '',
    undefined,
  ])('forces %s to download as a binary attachment', (mime) => {
    const h = downloadHeaders(mime, 'x.html');
    expect(h.contentDisposition.startsWith('attachment;')).toBe(true);
    expect(h.contentType).toBe('application/octet-stream');
  });
});

describe('contentDisposition', () => {
  it('keeps the UTF-8 name and an ASCII fallback', () => {
    expect(contentDisposition('attachment', 'Contrato Peña Nº 1.pdf')).toBe(
      `attachment; filename="Contrato Pena No 1.pdf"; filename*=UTF-8''Contrato%20Pe%C3%B1a%20N%C2%BA%201.pdf`,
    );
  });

  it('neutralizes quotes, slashes and line breaks that could break the header', () => {
    const value = contentDisposition(
      'inline',
      'a"b\r\nSet-Cookie: x/..\\y.pdf',
    );
    expect(value).not.toMatch(/[\r\n]/);
    expect(value).toContain('filename="a_b__Set-Cookie: x_.._y.pdf"');
  });

  it('falls back to a generic name when empty', () => {
    expect(contentDisposition('attachment', '')).toContain(
      'filename="archivo"',
    );
  });
});

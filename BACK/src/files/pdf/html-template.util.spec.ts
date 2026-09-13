import { interpolateHtmlTemplate } from './html-template.util';

describe('interpolateHtmlTemplate', () => {
  it('replaces a resolved text variable, escaping HTML-sensitive characters', () => {
    const html = '<p>{{cliente.nombre}}</p>';
    const result = interpolateHtmlTemplate(html, {
      'cliente.nombre': 'Baez & Cía <VIP>',
    });
    expect(result).toBe('<p>Baez &amp; Cía &lt;VIP&gt;</p>');
  });

  it('leaves unresolved tokens untouched', () => {
    const html = '<p>{{no.existe}}</p>';
    const result = interpolateHtmlTemplate(html, { 'cliente.nombre': 'Oscar' });
    expect(result).toBe('<p>{{no.existe}}</p>');
  });

  it('replaces a table variable with a full <table> block', () => {
    const html = '<div>{{factura.items}}</div>';
    const result = interpolateHtmlTemplate(
      html,
      {},
      {
        'factura.items': { headers: ['A', 'B'], rows: [['1', '2']] },
      },
    );
    expect(result).toContain('<table class="data-table">');
    expect(result).toContain('<th>A</th><th>B</th>');
    expect(result).toContain('<td>1</td><td>2</td>');
  });

  it('resolves the same key consistently across multiple occurrences', () => {
    const html = '<p>{{factura.total}} / {{factura.total}}</p>';
    const result = interpolateHtmlTemplate(html, { 'factura.total': '1.000' });
    expect(result).toBe('<p>1.000 / 1.000</p>');
  });

  it('inserts a raw variable (e.g. the logo <img>) without escaping it', () => {
    const html = '<div>{{tenant.logo}}</div>';
    const result = interpolateHtmlTemplate(
      html,
      {},
      {},
      { 'tenant.logo': '<img src="data:image/png;base64,abc" />' },
    );
    expect(result).toBe('<div><img src="data:image/png;base64,abc" /></div>');
  });
});

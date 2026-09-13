import {
  convertTiptapToHtml,
  type TiptapNode,
} from './tiptap-to-html.converter';

const noVars = () => undefined;
const noTables = () => undefined;

describe('convertTiptapToHtml', () => {
  it('converts a simple paragraph with interpolated text', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hola {{cliente.nombre}}, gracias.' },
          ],
        },
      ],
    };

    const html = convertTiptapToHtml(
      doc,
      (key) => (key === 'cliente.nombre' ? 'Juan Pérez' : undefined),
      noTables,
    );

    expect(html).toBe('<p>Hola Juan Pérez, gracias.</p>');
  });

  it('leaves unresolved tokens untouched', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '{{ghost.key}}' }],
        },
      ],
    };

    const html = convertTiptapToHtml(doc, noVars, noTables);
    expect(html).toBe('<p>{{ghost.key}}</p>');
  });

  it('escapes HTML-special characters in both template text and resolved values', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Precio & condiciones: {{monto}}' }],
        },
      ],
    };

    const html = convertTiptapToHtml(
      doc,
      (key) => (key === 'monto' ? '<script>x</script>' : undefined),
      noTables,
    );
    expect(html).toBe(
      '<p>Precio &amp; condiciones: &lt;script&gt;x&lt;/script&gt;</p>',
    );
  });

  it('applies bold/italic/strike/code marks', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
            { type: 'text', text: 'strike', marks: [{ type: 'strike' }] },
            { type: 'text', text: 'code', marks: [{ type: 'code' }] },
          ],
        },
      ],
    };

    const html = convertTiptapToHtml(doc, noVars, noTables);
    expect(html).toBe(
      '<p><strong>bold</strong><em>italic</em><s>strike</s><code>code</code></p>',
    );
  });

  it('converts headings to their tag level, capped at h3', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Título' }],
        },
        {
          type: 'heading',
          attrs: { level: 5 },
          content: [{ type: 'text', text: 'Sub' }],
        },
      ],
    };

    const html = convertTiptapToHtml(doc, noVars, noTables);
    expect(html).toBe('<h1>Título</h1><h3>Sub</h3>');
  });

  it('converts a bullet list into li items', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Uno' }] },
              ],
            },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Dos' }] },
              ],
            },
          ],
        },
      ],
    };

    const html = convertTiptapToHtml(doc, noVars, noTables);
    expect(html).toBe('<ul><li><p>Uno</p></li><li><p>Dos</p></li></ul>');
  });

  it('renders a horizontal rule', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{ type: 'horizontalRule' }],
    };
    expect(convertTiptapToHtml(doc, noVars, noTables)).toBe('<hr>');
  });

  // ── Bug fix: la tabla de variable se resuelve sin importar la posición ────

  it('renders a paragraph containing only {{venta.items}} as a table (no surrounding <p>)', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '{{venta.items}}' }],
        },
      ],
    };

    const html = convertTiptapToHtml(doc, noVars, (key) =>
      key === 'venta.items'
        ? { headers: ['Producto', 'Cantidad'], rows: [['Heladera', '1']] }
        : undefined,
    );

    expect(html).toBe(
      '<table class="data-table"><thead><tr><th>Producto</th><th>Cantidad</th></tr></thead><tbody><tr><td>Heladera</td><td>1</td></tr></tbody></table>',
    );
  });

  it('resolves {{venta.items}} embedded mid-sentence into a table between the surrounding text (the reported bug)', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'El Vendedor transfiere al Comprador el articulo {{venta.items}}.',
            },
          ],
        },
      ],
    };

    const html = convertTiptapToHtml(doc, noVars, (key) =>
      key === 'venta.items'
        ? { headers: ['Producto'], rows: [['Heladera']] }
        : undefined,
    );

    expect(html).toBe(
      '<p>El Vendedor transfiere al Comprador el articulo </p>' +
        '<table class="data-table"><thead><tr><th>Producto</th></tr></thead><tbody><tr><td>Heladera</td></tr></tbody></table>' +
        '<p>.</p>',
    );
  });

  it('falls back to literal text when the table variable is not provided', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '{{venta.items}}' }],
        },
      ],
    };

    const html = convertTiptapToHtml(doc, noVars, noTables);
    expect(html).toBe('<p>{{venta.items}}</p>');
  });

  // ── Tablas nativas insertadas desde el editor (extensión de tabla de TipTap) ──

  it('converts a native TipTap table (table/tableRow/tableHeader/tableCell) to HTML', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Col A' }],
                    },
                  ],
                },
                {
                  type: 'tableHeader',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Col B' }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '1' }],
                    },
                  ],
                },
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '2' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const html = convertTiptapToHtml(doc, noVars, noTables);
    expect(html).toBe(
      '<table class="content-table"><tbody>' +
        '<tr><th><p>Col A</p></th><th><p>Col B</p></th></tr>' +
        '<tr><td><p>1</p></td><td><p>2</p></td></tr>' +
        '</tbody></table>',
    );
  });
});

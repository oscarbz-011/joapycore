import PizZip from 'pizzip';
import { DocxTemplateService } from './docx-template.service';

// Construye el .docx mínimo válido que PizZip/Docxtemplater pueden abrir sin
// tirar: las 3 partes obligatorias de un OOXML ([Content_Types].xml,
// _rels/.rels, word/document.xml) más el .rels del documento (opcional pero
// convencional). El cuerpo trae un tag simple ({{cliente.nombre}}) y un loop
// ({{#factura.items}}...{{/factura.items}}) con la convención col1..colN.
function buildFixtureDocx(): Buffer {
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
  );

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{{cliente.nombre}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{#factura.items}}{{col1}}{{/factura.items}}</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
  );

  return zip.generate({ type: 'nodebuffer' });
}

describe('DocxTemplateService', () => {
  let service: DocxTemplateService;
  let fixture: Buffer;

  beforeEach(() => {
    service = new DocxTemplateService();
    fixture = buildFixtureDocx();
  });

  describe('detectVariables', () => {
    it('finds a plain text tag and classifies a loop as a table', () => {
      const vars = service.detectVariables(fixture);

      expect(vars).toEqual(
        expect.arrayContaining([
          { key: 'cliente.nombre', label: 'cliente.nombre', type: 'text' },
          { key: 'factura.items', label: 'factura.items', type: 'table' },
        ]),
      );
      // No expone los tags internos del loop (col1) como variable de nivel raíz.
      expect(vars.map((v) => v.key)).not.toContain('col1');
    });
  });

  describe('fillTemplate', () => {
    it('returns a non-empty buffer that reopens as a valid zip with the values interpolated', () => {
      const result = service.fillTemplate(fixture, {
        cliente: { nombre: 'Juan Pérez' },
        factura: { items: [{ col1: 'Heladera' }, { col1: 'Cocina' }] },
      });

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const reopened = new PizZip(result);
      expect(Object.keys(reopened.files).length).toBeGreaterThan(0);
      expect(reopened.files['word/document.xml']).toBeDefined();

      const xml = reopened.files['word/document.xml'].asText();
      expect(xml).toContain('Juan Pérez');
      expect(xml).toContain('Heladera');
      expect(xml).toContain('Cocina');
      expect(xml).not.toContain('{{cliente.nombre}}');
    });

    it('does not throw when a referenced variable is missing (nullGetter)', () => {
      expect(() => service.fillTemplate(fixture, {})).not.toThrow();
    });
  });
});

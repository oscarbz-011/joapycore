// Definición de una variable de plantilla de documento. Vive en common porque
// la usan Documentos (catálogo de variables por tipo de plantilla) y Files
// (render de .docx), y un módulo transversal no debe depender de uno de negocio.
export interface TemplateVariableDef {
  key: string;
  label: string;
  type: 'text' | 'table';
  // Solo para type 'table': una etiqueta por columna, en el mismo orden que
  // arma el listener correspondiente (PdfTableVariable.headers). Sirve para
  // que el frontend arme la fila con loop de Word ({{#tag}}{{col1}}...
  // {{colN}}{{/tag}}, ver DocxTemplateService) con la cantidad exacta de
  // columnas — si cambian los headers del listener, actualizar acá también.
  columns?: string[];
}

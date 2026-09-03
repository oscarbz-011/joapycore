import type { PdfTableVariable } from '../pdf/tiptap-to-html.converter';

// Convierte el mismo shape plano que ya arman los 5 listeners de documentos
// (variables con claves punteadas tipo "cliente.nombre" + tableVariables con
// filas string[][]) al objeto anidado que espera Docxtemplater. Los headers
// de PdfTableVariable son etiquetas en español pensadas para un <th> HTML,
// no nombres de tag válidos — por eso cada fila se expone como objeto
// posicional {col1, col2, ...} (1-indexado), no con los headers como clave.
export function unflattenVariables(
  flat: Record<string, string>,
  tables: Record<string, PdfTableVariable> = {},
): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  const setPath = (path: string, value: unknown) => {
    const parts = path.split('.');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = value;
  };

  for (const [key, value] of Object.entries(flat)) setPath(key, value ?? '');
  for (const [key, table] of Object.entries(tables)) {
    setPath(
      key,
      table.rows.map((row) => {
        const rowObj: Record<string, string> = {};
        row.forEach((cell, i) => {
          rowObj[`col${i + 1}`] = cell ?? '';
        });
        return rowObj;
      }),
    );
  }
  return root;
}

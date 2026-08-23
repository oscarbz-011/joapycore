// Interpolación de variables `{{clave}}` sobre una plantilla de HTML/CSS
// crudo (a diferencia de tiptap-to-html.converter.ts, que recorre un árbol
// de nodos TipTap) — usado por facturas y recibos, donde el layout necesita
// control fino que TipTap no puede dar (columnas exactas, posicionamiento,
// bordes). El token puede resolver a texto simple o a una tabla completa.

import type { PdfTableVariable } from './tiptap-to-html.converter';

export type { PdfTableVariable };

const TOKEN_RE = /\{\{([\w.]+)\}\}/g;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function convertDataTableHtml(table: PdfTableVariable): string {
  const headerRow = `<tr>${table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  const bodyRows = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="data-table"><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// rawVariables se inserta tal cual, SIN escapar — para fragmentos de HTML ya
// armados (ej. el <img> del logo). No usar para datos de usuario/negocio:
// esos van siempre por `variables`, que sí escapa.
export function interpolateHtmlTemplate(
  html: string,
  variables: Record<string, string>,
  tableVariables: Record<string, PdfTableVariable> = {},
  rawVariables: Record<string, string> = {},
): string {
  return html.replace(TOKEN_RE, (match, key: string) => {
    if (hasOwn(tableVariables, key)) return convertDataTableHtml(tableVariables[key]);
    if (hasOwn(rawVariables, key)) return rawVariables[key];
    if (hasOwn(variables, key)) return escapeHtml(variables[key]);
    return match;
  });
}

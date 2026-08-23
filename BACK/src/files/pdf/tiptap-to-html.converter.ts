// Convierte un documento TipTap (JSON) a un fragmento HTML, interpolando
// variables `{{clave}}` a nivel de nodo de texto. Limitación conocida y
// aceptada: un token partido entre dos marks de formato distinto (ej.
// "{{clie" en negrita + "nte.nombre}}" sin negrita) no se une — mismo límite
// que la combinación de correspondencia de Word, no se resuelve acá para no
// sobre-ingenieriar.
//
// Las variables de tipo tabla (ej. venta.items) SÍ se resuelven sin importar
// dónde aparezca el token dentro del párrafo — a diferencia del viejo
// convertidor a pdfmake, que solo las reconocía cuando el token era el único
// contenido del párrafo. Un token de tabla a mitad de oración parte el
// párrafo en (texto antes) + (tabla) + (texto después), todos como hermanos
// válidos en el HTML — no hace falta que esté solo.

export interface TiptapMark {
  type: string;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

export interface PdfTableVariable {
  headers: string[];
  rows: string[][];
}

export type VariableResolver = (key: string) => string | undefined;
export type TableVariableResolver = (key: string) => PdfTableVariable | undefined;

const TOKEN_RE = /\{\{([\w.]+)\}\}/g;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapa primero (ninguno de los caracteres de un token {{clave}} es
// especial en HTML, así que el regex de tokens sigue matcheando igual sobre
// el texto ya escapado) y recién ahí interpola — así el valor resuelto
// también queda escapado, sin depender de que el llamador lo haga.
function interpolate(text: string, resolve: VariableResolver): string {
  const escaped = escapeHtml(text);
  return escaped.replace(TOKEN_RE, (match, key: string) => {
    const value = resolve(key);
    return value !== undefined ? escapeHtml(value) : match;
  });
}

function convertTextNodeToHtml(node: TiptapNode, resolve: VariableResolver): string {
  let html = interpolate(node.text ?? '', resolve);
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':
        html = `<strong>${html}</strong>`;
        break;
      case 'italic':
        html = `<em>${html}</em>`;
        break;
      case 'strike':
        html = `<s>${html}</s>`;
        break;
      case 'code':
        html = `<code>${html}</code>`;
        break;
    }
  }
  return html;
}

function convertInlineToHtml(nodes: TiptapNode[] = [], resolve: VariableResolver): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return convertTextNodeToHtml(node, resolve);
      if (node.type === 'hardBreak') return '<br>';
      return '';
    })
    .join('');
}

interface InlineSegment {
  kind: 'inline';
  nodes: TiptapNode[];
}
interface TableSegment {
  kind: 'table';
  table: PdfTableVariable;
}
type ParagraphSegment = InlineSegment | TableSegment;

// Recorre los nodos inline de un párrafo buscando texto plano que contenga
// un token que resuelva a una variable de tabla, y parte el párrafo ahí.
function splitParagraphOnTableTokens(
  nodes: TiptapNode[],
  resolveTable: TableVariableResolver,
): ParagraphSegment[] {
  const segments: ParagraphSegment[] = [];
  let current: TiptapNode[] = [];

  for (const node of nodes) {
    if (node.type !== 'text' || !node.text) {
      current.push(node);
      continue;
    }

    const re = /\{\{([\w.]+)\}\}/g;
    let lastIndex = 0;
    let matched = false;
    let match: RegExpExecArray | null;
    while ((match = re.exec(node.text)) !== null) {
      const table = resolveTable(match[1]);
      if (!table) continue;
      matched = true;

      const before = node.text.slice(lastIndex, match.index);
      if (before) current.push({ type: 'text', text: before, marks: node.marks });
      if (current.length > 0) {
        segments.push({ kind: 'inline', nodes: current });
        current = [];
      }
      segments.push({ kind: 'table', table });
      lastIndex = match.index + match[0].length;
    }

    if (matched) {
      const after = node.text.slice(lastIndex);
      if (after) current.push({ type: 'text', text: after, marks: node.marks });
    } else {
      current.push(node);
    }
  }

  if (current.length > 0) segments.push({ kind: 'inline', nodes: current });
  return segments;
}

function convertDataTableHtml(table: PdfTableVariable): string {
  const headerRow = `<tr>${table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  const bodyRows = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="data-table"><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;
}

function convertNativeTableCellHtml(
  cell: TiptapNode,
  resolve: VariableResolver,
  resolveTable: TableVariableResolver,
): string {
  const tag = cell.type === 'tableHeader' ? 'th' : 'td';
  const inner = (cell.content ?? [])
    .flatMap((child) => convertBlockNode(child, resolve, resolveTable))
    .join('');
  return `<${tag}>${inner}</${tag}>`;
}

function convertNativeTableHtml(
  node: TiptapNode,
  resolve: VariableResolver,
  resolveTable: TableVariableResolver,
): string {
  const rows = (node.content ?? [])
    .map((row) => {
      const cells = (row.content ?? [])
        .map((cell) => convertNativeTableCellHtml(cell, resolve, resolveTable))
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table class="content-table"><tbody>${rows}</tbody></table>`;
}

function convertListItemHtml(
  node: TiptapNode,
  resolve: VariableResolver,
  resolveTable: TableVariableResolver,
): string {
  const inner = (node.content ?? [])
    .flatMap((child) => convertBlockNode(child, resolve, resolveTable))
    .join('');
  return `<li>${inner}</li>`;
}

function convertBlockNode(
  node: TiptapNode,
  resolve: VariableResolver,
  resolveTable: TableVariableResolver,
): string[] {
  switch (node.type) {
    case 'paragraph': {
      const segments = splitParagraphOnTableTokens(node.content ?? [], resolveTable);
      const hasTable = segments.some((s) => s.kind === 'table');
      if (!hasTable) {
        return [`<p>${convertInlineToHtml(node.content, resolve)}</p>`];
      }
      return segments.flatMap((seg) => {
        if (seg.kind === 'table') return [convertDataTableHtml(seg.table)];
        if (seg.nodes.length === 0) return [];
        return [`<p>${convertInlineToHtml(seg.nodes, resolve)}</p>`];
      });
    }
    case 'heading': {
      const level = Math.min(Number(node.attrs?.level ?? 1), 3);
      return [`<h${level}>${convertInlineToHtml(node.content, resolve)}</h${level}>`];
    }
    case 'bulletList':
      return [
        `<ul>${(node.content ?? []).map((li) => convertListItemHtml(li, resolve, resolveTable)).join('')}</ul>`,
      ];
    case 'orderedList':
      return [
        `<ol>${(node.content ?? []).map((li) => convertListItemHtml(li, resolve, resolveTable)).join('')}</ol>`,
      ];
    case 'blockquote':
      return [
        `<blockquote>${(node.content ?? []).flatMap((child) => convertBlockNode(child, resolve, resolveTable)).join('')}</blockquote>`,
      ];
    case 'horizontalRule':
      return ['<hr>'];
    case 'table':
      return [convertNativeTableHtml(node, resolve, resolveTable)];
    default:
      return [];
  }
}

export function convertTiptapToHtml(
  doc: TiptapNode,
  resolve: VariableResolver,
  resolveTable: TableVariableResolver,
): string {
  return (doc.content ?? []).flatMap((node) => convertBlockNode(node, resolve, resolveTable)).join('');
}

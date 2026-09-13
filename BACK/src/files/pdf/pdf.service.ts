import { Injectable } from '@nestjs/common';
import type { Browser } from 'puppeteer';
import { interpolateHtmlTemplate } from './html-template.util';
import {
  convertTiptapToHtml,
  type PdfTableVariable,
  type TiptapNode,
} from './tiptap-to-html.converter';

export interface PdfHeaderOptions {
  logoDataUri?: string;
  companyName?: string;
}

export type PdfPageSize = 'A4' | { width: string; height: string };

function pageSizeCss(pageSize: PdfPageSize): string {
  return pageSize === 'A4' ? 'A4' : `${pageSize.width} ${pageSize.height}`;
}

function pageStyles(pageSize: PdfPageSize): string {
  return `
  @page { size: ${pageSizeCss(pageSize)}; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt;
    color: #1a1a1a;
    line-height: 1.5;
    padding: 40px 50px;
  }
  h1, h2, h3 { font-weight: 700; margin: 0 0 6px; }
  h1 { font-size: 18pt; margin-top: 12px; }
  h2 { font-size: 15pt; margin-top: 10px; }
  h3 { font-size: 12pt; margin-top: 8px; }
  p { margin: 0 0 6px; }
  li p { margin: 0; }
  ul, ol { margin: 0 0 6px; padding-left: 20px; }
  blockquote {
    margin: 4px 0 4px 10px;
    padding-left: 10px;
    border-left: 2px solid #cccccc;
    font-style: italic;
    color: #555555;
  }
  hr { border: none; border-top: 1px solid #cccccc; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; }
  .data-table th, .data-table td,
  .content-table th, .content-table td {
    border: 1px solid #dddddd;
    padding: 5px 8px;
    text-align: left;
    font-size: 9.5pt;
  }
  .data-table th, .content-table th { background: #f3f3f3; font-weight: 700; }
  .doc-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 12px;
    margin-bottom: 16px;
    border-bottom: 1px solid #e0e0e0;
  }
  .doc-header img { max-height: 48px; max-width: 160px; object-fit: contain; }
  .doc-header .company-name { font-size: 12pt; font-weight: 700; }
`;
}

export function buildHeaderHtml(options?: PdfHeaderOptions): string {
  if (!options?.logoDataUri && !options?.companyName) return '';
  const logo = options.logoDataUri
    ? `<img src="${options.logoDataUri}" alt="Logo" />`
    : '';
  const name = options.companyName
    ? `<span class="company-name">${options.companyName}</span>`
    : '';
  return `<div class="doc-header">${logo}${name}</div>`;
}

@Injectable()
export class PdfService {
  // Plantillas TipTap (contrato de venta): el body se arma recorriendo el
  // árbol de nodos, y se envuelve en el shell de estilos genérico
  // (pageStyles) pensado para prosa — encabezados, párrafos, tablas simples.
  async renderTemplate(
    contentJson: string,
    variables: Record<string, string>,
    tableVariables: Record<string, PdfTableVariable> = {},
    headerOptions?: PdfHeaderOptions,
    pageSize: PdfPageSize = 'A4',
  ): Promise<Buffer> {
    const doc = JSON.parse(contentJson) as TiptapNode;
    const bodyHtml = convertTiptapToHtml(
      doc,
      (key) => variables[key],
      (key) => tableVariables[key],
    );

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${pageStyles(pageSize)}</style>
</head>
<body>
${buildHeaderHtml(headerOptions)}
${bodyHtml}
</body>
</html>`;

    return this.renderHtmlToPdf(html, pageSize);
  }

  // Plantillas HTML/CSS crudo (factura, recibo): el contenido ya es un
  // documento HTML completo con su propio <style> — no se envuelve en el
  // shell genérico de renderTemplate, así el tenant tiene control total del
  // layout. Solo se interpolan los tokens {{clave}}.
  async renderHtmlTemplate(
    contentHtml: string,
    variables: Record<string, string>,
    tableVariables: Record<string, PdfTableVariable> = {},
    rawVariables: Record<string, string> = {},
    pageSize: PdfPageSize = 'A4',
  ): Promise<Buffer> {
    const resolved = interpolateHtmlTemplate(
      contentHtml,
      variables,
      tableVariables,
      rawVariables,
    );
    const html = resolved.includes('<html')
      ? resolved
      : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${resolved}</body></html>`;

    return this.renderHtmlToPdf(html, pageSize);
  }

  private async renderHtmlToPdf(
    html: string,
    pageSize: PdfPageSize,
  ): Promise<Buffer> {
    // `puppeteer` distribuye su entrypoint como ESM puro (`export * from
    // 'puppeteer-core'`) — un `import` estático se transpila a `require()` y
    // rompe tanto en ts-jest como en Nest en runtime. El import dinámico usa
    // el propio interop ESM↔CJS de Node y evita el problema.
    const { default: puppeteer } = await import('puppeteer');
    const browser: Browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      // Todo el contenido es HTML/CSS estático y el logo va embebido como
      // data: URI — no hay actividad de red que esperar, 'load' alcanza.
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        ...(pageSize === 'A4'
          ? { format: 'A4' as const }
          : { width: pageSize.width, height: pageSize.height }),
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}

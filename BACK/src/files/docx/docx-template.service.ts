import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { TemplateVariableDef } from '../../common/types/template-variable.interface';

const DELIMITERS = { start: '{{', end: '}}' } as const;

// El parser por defecto de Docxtemplater resuelve un tag con `scope[tag]`
// literal — no interpreta el punto como acceso anidado, así que
// `{{cliente.nombre}}` nunca matchearía contra `{cliente:{nombre:...}}`
// (el shape que arma unflattenVariables). Docxtemplater trae un parser de
// expresiones completo (`docxtemplater/expressions.js`) que sí soporta rutas
// con punto, pero evalúa con `new Function` — evitable acá porque solo
// necesitamos acceso a propiedades anidadas, no expresiones arbitrarias, y
// las claves del tag vienen de un .docx que puede haber subido cualquier
// tenant. Este parser mínimo solo camina el path por `.` sin eval.
function scopePathParser(tag: string): { get(scope: unknown): unknown } {
  return {
    get(scope: unknown): unknown {
      if (tag === '.') return scope;
      return tag.split('.').reduce<unknown>((acc, key) => {
        if (acc === null || typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[key];
      }, scope);
    },
  };
}

const DOCXTEMPLATER_OPTIONS = {
  delimiters: DELIMITERS,
  paragraphLoop: true,
  linebreaks: true,
  parser: scopePathParser,
  nullGetter: () => '',
} as const;

// `getTags()` existe en tiempo de ejecución (ver
// node_modules/docxtemplater/js/docxtemplater.js, método `getTags`) pero no
// está declarado en el .d.ts que publica el paquete — se tipa acá a mano,
// verificado contra esa fuente. Cada nodo del árbol es un objeto vacío `{}`
// para un tag simple ({{clave}}), o un objeto con los tags internos como
// hijos para un loop ({{#clave}}...{{/clave}}) — así se puede distinguir
// texto de tabla sin necesidad de un regex aparte sobre el XML.
interface DocxTagsNode {
  [key: string]: DocxTagsNode;
}
interface DocxFileTags {
  target: string;
  tags: DocxTagsNode;
}
interface DocxGetTagsResult {
  document?: DocxFileTags;
  headers: DocxFileTags[];
  footers: DocxFileTags[];
}
interface DocxtemplaterWithTags {
  getTags(): DocxGetTagsResult;
}

@Injectable()
export class DocxTemplateService {
  // Detecta las variables `{{clave}}` de un .docx (cuerpo + encabezados +
  // pies de página). Best-effort: no falla si el documento no tiene tags o
  // si el parser no puede resolver algo — devuelve lo que haya encontrado.
  detectVariables(buffer: Buffer): TemplateVariableDef[] {
    const zip = new PizZip(buffer);
    const doc = new Docxtemplater(zip, DOCXTEMPLATER_OPTIONS);

    const tagInfo = (doc as unknown as DocxtemplaterWithTags).getTags();
    const trees: DocxTagsNode[] = [
      tagInfo.document?.tags ?? {},
      ...tagInfo.headers.map((h) => h.tags),
      ...tagInfo.footers.map((f) => f.tags),
    ];

    const seen = new Set<string>();
    const defs: TemplateVariableDef[] = [];
    for (const tree of trees) {
      for (const [key, children] of Object.entries(tree)) {
        if (seen.has(key)) continue;
        seen.add(key);
        const isTable = Object.keys(children).length > 0;
        defs.push({ key, label: key, type: isTable ? 'table' : 'text' });
      }
    }
    return defs;
  }

  // Llena el .docx con los datos ya anidados (ver unflattenVariables).
  // nullGetter: () => '' — nunca tira por variable faltante, mismo criterio
  // best-effort que el resto del módulo Documents (interpolateHtmlTemplate,
  // convertTiptapToHtml).
  fillTemplate(buffer: Buffer, data: Record<string, unknown>): Buffer {
    const zip = new PizZip(buffer);
    const doc = new Docxtemplater(zip, DOCXTEMPLATER_OPTIONS);
    doc.render(data);
    return doc.toBuffer();
  }

  // Convierte un .docx ya llenado a PDF vía Gotenberg (servicio Docker que
  // envuelve LibreOffice headless detrás de una API HTTP — ver
  // docker-compose.yml, servicio "gotenberg"). Reemplaza al `spawn('soffice',
  // ...)` local que usábamos antes: ese enfoque requería instalar LibreOffice
  // a mano en cada máquina de desarrollo, algo que no escala en un equipo con
  // varios entornos — con Gotenberg alcanza con `docker compose up -d`, igual
  // que ya se hace para Postgres/MinIO/Maildev.
  async convertToPdf(buffer: Buffer): Promise<Buffer> {
    const url = process.env['GOTENBERG_URL'] || 'http://localhost:3009';
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      'document.docx',
    );

    let response: Response;
    try {
      response = await fetch(`${url}/forms/libreoffice/convert`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `No se pudo conectar con el conversor de documentos (Gotenberg, ${url}): ${(error as Error).message}. ¿Está corriendo? ("docker compose up -d gotenberg")`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new BadGatewayException(
        `El conversor de documentos (Gotenberg) devolvió un error (${response.status}): ${detail.slice(0, 500)}`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

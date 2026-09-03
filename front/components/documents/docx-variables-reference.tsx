'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Braces, Check, Copy } from 'lucide-react';
import { documentsApi, type TemplateKind, type TemplateVariable } from '../../lib/api/documents';

function CopyableTag({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copiar"
      className="group flex w-full items-start justify-between gap-2 rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-left transition-colors hover:border-accent-on/40 hover:bg-accent-subtle"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="break-all font-mono text-[11.5px] font-semibold text-accent-on">{value}</span>
        {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
      </div>
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/50 group-hover:text-accent-on">
        {copied ? <Check size={12} strokeWidth={3} className="text-accent-on" /> : <Copy size={12} />}
      </span>
    </button>
  );
}

// Una variable "tabla" (venta.items, credito.cuotas, etc.) no se pega como
// una sola etiqueta — a diferencia del editor TipTap/HTML, donde {{tag}} se
// reemplaza por un <table> HTML ya armado, en un .docx Word necesita una
// tabla real con una fila templada: la primera celda abre el loop
// ({{#tag}}), la última lo cierra ({{/tag}}), y cada celda intermedia toma
// el valor de columna correspondiente ({{col1}}, {{col2}}, ...) — sintaxis
// de Docxtemplater para repetir filas, verificada contra el motor real de
// este proyecto (ver ARCHITECTURE.md). Sin esto, Word/Docxtemplater trata
// {{tag}} como cualquier otra etiqueta de texto y termina imprimiendo
// "[object Object],[object Object],..." — el bug que originó este panel.
function cellTags(key: string, columns: string[]): string[] {
  return columns.map((_, i) => {
    let tag = `{{col${i + 1}}}`;
    if (i === 0) tag = `{{#${key}}}${tag}`;
    if (i === columns.length - 1) tag = `${tag}{{/${key}}}`;
    return tag;
  });
}

// Referencia de solo lectura para plantillas .docx: a diferencia de
// VariablesPanel (TipTap/HTML), acá no hay cursor donde insertar — el
// usuario copia cada etiqueta y la pega directo en Word.
export function DocxVariablesReference({ templateKind }: { templateKind?: TemplateKind }) {
  const { data: kinds = [] } = useQuery({
    queryKey: ['document-template-kinds'],
    queryFn: documentsApi.templateKinds,
    enabled: !!templateKind,
  });

  const vars: TemplateVariable[] = templateKind
    ? (kinds.find((k) => k.key === templateKind)?.variables ?? [])
    : [];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
        <Braces size={14} className="text-accent-on" />
        Variables disponibles
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-muted-foreground">
        Escribí (o copiá y pegá) estas etiquetas directo en el Word — un archivo .docx no tiene cursor de edición acá.
      </p>

      {!templateKind ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[11px] leading-relaxed text-muted-foreground/70">
          Esta plantilla es de uso libre — no tiene variables fijas. Escribí{' '}
          <code className="font-mono">{'{{clave}}'}</code> donde quieras un dato en el Word, y vas a poder completarlo al generar el documento.
        </p>
      ) : vars.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[11px] leading-relaxed text-muted-foreground/70">
          No hay variables definidas para este tipo de plantilla.
        </p>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-0.5">
          {vars.map((v) =>
            v.type === 'table' && v.columns ? (
              <div key={v.key} className="space-y-1.5 rounded-xl border border-border bg-muted/10 p-2.5">
                <p className="text-[11px] text-muted-foreground">{v.label}</p>
                <p className="text-[10.5px] leading-relaxed text-muted-foreground/70">
                  Es una tabla — no se pega como una sola etiqueta. Armá una tabla en Word con una fila de {v.columns.length}{' '}
                  {v.columns.length === 1 ? 'celda' : 'celdas'} y pegá cada etiqueta en su celda, en este orden:
                </p>
                <div className="space-y-1">
                  {cellTags(v.key, v.columns).map((tag, i) => (
                    <CopyableTag key={i} value={tag} label={`Celda ${i + 1}: ${v.columns![i]}`} />
                  ))}
                </div>
              </div>
            ) : (
              <CopyableTag key={v.key} value={`{{${v.key}}}`} label={v.label} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

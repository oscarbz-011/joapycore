'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Braces, Check } from 'lucide-react';
import { documentsApi, extractVariableKeys, type TemplateKind } from '../../lib/api/documents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface VariableRow {
  key: string;
  label?: string;
  used: boolean;
}

// Panel único de variables: combina el vocabulario fijo de la plantilla
// (cuando aplica) con las variables libres ya detectadas en el contenido,
// en una sola lista scrolleable — reemplaza los dos paneles apilados que
// había antes (TemplateVariablesPanel + CustomVariablesPanel).
export function VariablesPanel({
  templateKind,
  content,
  onInsert,
}: {
  templateKind?: TemplateKind;
  content?: string;
  onInsert: (token: string) => void;
}) {
  const [name, setName] = useState('');

  const { data: kinds = [] } = useQuery({
    queryKey: ['document-template-kinds'],
    queryFn: documentsApi.templateKinds,
    enabled: !!templateKind,
  });

  const fixedVars = templateKind ? (kinds.find((k) => k.key === templateKind)?.variables ?? []) : [];
  const detectedKeys = extractVariableKeys(content);
  const detectedSet = new Set(detectedKeys);

  const rows: VariableRow[] = [
    ...fixedVars.map((v) => ({ key: v.key, label: v.label, used: detectedSet.has(v.key) })),
    ...detectedKeys
      .filter((key) => !fixedVars.some((v) => v.key === key))
      .map((key) => ({ key, used: true })),
  ];

  function insertCustom() {
    const key = name.trim().replace(/\s+/g, '_');
    if (!key) return;
    onInsert(`{{${key}}}`);
    setName('');
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
        <Braces size={14} className="text-accent-on" />
        Variables
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-muted-foreground">
        Insertá variables en el texto. Escribí un nombre y presioná Insertar, o escribí{' '}
        <code className="font-mono">{'{{clave}}'}</code> directo en el texto.
        {templateKind && ' Al generar el documento se completan con los datos reales de la venta.'}
      </p>

      <div className="mb-3 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), insertCustom())}
          placeholder="nombre_cliente"
          className="h-8 flex-1 text-[12px]"
        />
        <Button size="sm" onClick={insertCustom} disabled={!name.trim()}>
          + Insertar
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[11px] leading-relaxed text-muted-foreground/70">
          Aún no hay variables. Escribí un nombre arriba e insértala, o escribí{' '}
          <code className="font-mono">{'{{clave}}'}</code> en el texto.
        </p>
      ) : (
        <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-0.5">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => onInsert(`{{${row.key}}}`)}
              title={row.used ? 'Ya usada en el documento — click para insertar de nuevo' : 'Insertar'}
              className={`group flex w-full items-start justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                row.used
                  ? 'border-accent-on/50 bg-accent-subtle'
                  : 'border-border bg-muted/20 hover:border-accent-on/40 hover:bg-accent-subtle'
              }`}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-[11.5px] font-semibold text-accent-on">
                  {`{{${row.key}}}`}
                </span>
                {row.label && <span className="text-[11.5px] text-muted-foreground">{row.label}</span>}
              </div>
              {row.used && (
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-on text-white">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

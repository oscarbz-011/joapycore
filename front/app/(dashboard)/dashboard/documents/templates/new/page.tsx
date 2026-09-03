'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Code2, FileUp, PenLine } from 'lucide-react';
import { DocumentEditorForm } from '../../../../../../components/documents/document-editor-form';
import type { DocContentFormat } from '../../../../../../lib/api/documents';

const OPTIONS: { format: DocContentFormat; label: string; description: string; icon: typeof PenLine }[] = [
  {
    format: 'TIPTAP',
    label: 'Editor de texto enriquecido',
    description: 'Escribí la plantilla con un editor visual, como en Word.',
    icon: PenLine,
  },
  {
    format: 'HTML',
    label: 'HTML/CSS',
    description: 'Control total del layout — para diseños exactos como facturas o recibos.',
    icon: Code2,
  },
  {
    format: 'DOCX',
    label: 'Subir Word (.docx)',
    description: 'Subí un archivo ya diseñado — encabezado, pie y marca de agua quedan tal cual.',
    icon: FileUp,
  },
];

// Elegir el formato ANTES de entrar al editor evita el rodeo de crear la
// plantilla en TIPTAP por defecto y recién después descubrir el selector de
// "Formato de contenido" adentro — sobre todo para DOCX, donde no hay nada
// que editar visualmente, la elección tiene que ser la primera pantalla.
export default function NewTemplatePage() {
  const router = useRouter();
  const [format, setFormat] = useState<DocContentFormat | null>(null);

  if (format) {
    return <DocumentEditorForm mode="template" initialContentFormat={format} />;
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <button
        type="button"
        onClick={() => router.push('/dashboard/documents/templates')}
        className="mb-6 flex items-center gap-2 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} />
        Plantillas
      </button>

      <h1 className="text-[22px] font-extrabold tracking-tight text-foreground">Nueva plantilla</h1>
      <p className="mt-1 mb-6 text-[14px] text-muted-foreground">¿Cómo querés crearla?</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {OPTIONS.map(({ format: f, label, description, icon: Icon }) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            className="flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm"
          >
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent-subtle text-accent-on">
              <Icon size={17} />
            </div>
            <span className="text-[13.5px] font-semibold text-foreground">{label}</span>
            <span className="text-[12px] leading-relaxed text-muted-foreground">{description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

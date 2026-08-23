'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { documentsApi } from '../../../../../lib/api/documents';
import { DocumentEditorForm } from '../../../../../components/documents/document-editor-form';

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: doc, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => documentsApi.get(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-[13.5px] text-muted-foreground">
        Cargando documento...
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <FileText size={40} className="text-muted-foreground/30" />
        <p className="text-[13.5px] text-muted-foreground">Documento no encontrado.</p>
        <button onClick={() => router.back()} className="text-[13.5px] font-medium text-foreground underline underline-offset-2">
          Volver
        </button>
      </div>
    );
  }

  return <DocumentEditorForm mode={doc.isTemplate ? 'template' : 'document'} initial={doc} />;
}

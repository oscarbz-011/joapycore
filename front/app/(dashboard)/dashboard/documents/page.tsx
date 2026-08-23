'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { DocumentGrid } from '../../../../components/documents/document-grid';
import { Button } from '@/components/ui/button';
import { DocumentsNav } from './documents-nav';

export default function DocumentsPage() {
  const router = useRouter();

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">Documentos</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Archivos, contratos y documentación general del negocio.
          </p>
        </div>
        <Button onClick={() => router.push('/dashboard/documents/new')} className="gap-2">
          <Plus size={15} />
          Nuevo documento
        </Button>
      </div>

      <DocumentsNav />
      <DocumentGrid mode="document" />
    </div>
  );
}

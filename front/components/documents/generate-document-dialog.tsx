'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { documentsApi, type Document } from '../../lib/api/documents';
import { isApiError } from '../../lib/api/api-error';
import { openPdf } from '../../lib/open-pdf';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Modal simple para el caso "plantilla libre" (sin templateKind): el usuario
// completa las variables de tipo texto detectadas en el .docx y descarga el
// PDF generado. No persiste historial — cada generación es a demanda, igual
// que los 5 listeners automáticos existentes.
export function GenerateDocumentDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const textVars = (doc.variables ?? []).filter((v) => v.type === 'text');
  const [values, setValues] = useState<Record<string, string>>({});

  const generateMutation = useMutation({
    mutationFn: () => documentsApi.generate(doc.id, values),
    onSuccess: async ({ fileId }) => {
      await openPdf(fileId);
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-base font-semibold">Generar &quot;{doc.title}&quot;</DialogTitle>
        <div className="space-y-4">
          {textVars.length === 0 && (
            <p className="text-sm text-muted-foreground">Esta plantilla no tiene variables para completar.</p>
          )}
          {textVars.map((v) => (
            <div key={v.key} className="space-y-1.5">
              <Label className="text-[12px]">{v.key}</Label>
              <Input
                value={values[v.key] ?? ''}
                onChange={(e) => setValues((p) => ({ ...p, [v.key]: e.target.value }))}
              />
            </div>
          ))}
          {generateMutation.isError && (
            <p className="text-sm text-destructive">
              {isApiError(generateMutation.error) ? generateMutation.error.message : 'No se pudo generar el documento. Intentá de nuevo.'}
            </p>
          )}
          <Button className="w-full" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            {generateMutation.isPending ? 'Generando...' : 'Generar y descargar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { ValidityFields } from '@/components/procurement/validity-fields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CatalogValidity } from '@/lib/api/procurement';
import { validityRangeError } from '@/lib/catalog-validity';

/**
 * Elige el archivo de la lista de precios y, opcionalmente, hasta cuándo rigen
 * esos precios. La vigencia es de la lista entera.
 */
export function CatalogImportDialog({
  hasItems,
  onImport,
  onClose,
}: {
  /** El catálogo ya tiene ítems: se avisa que la lista nueva pisa su vigencia. */
  hasItems: boolean;
  onImport: (file: File, validity: CatalogValidity) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const rangeError = validityRangeError(validFrom, validTo);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar lista de precios</DialogTitle>
          <DialogDescription>
            Un archivo .xlsx o .csv con al menos las columnas Código y Descripción.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file || rangeError) return;
            onImport(file, {
              validFrom: validFrom || undefined,
              validTo: validTo || undefined,
            });
            onClose();
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="sr-only"
            aria-label="Archivo de la lista de precios"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <FileSpreadsheet size={18} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {file ? file.name : 'Elegir archivo'}
              </span>
              <span className="block text-xs text-muted-foreground">
                {file ? 'Tocá para cambiarlo' : 'Excel (.xlsx) o CSV'}
              </span>
            </span>
          </button>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Vigencia de los precios</p>
            <ValidityFields
              idPrefix="catalog-import"
              from={validFrom}
              to={validTo}
              onFromChange={setValidFrom}
              onToChange={setValidTo}
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Se aplica a todos los ítems del archivo; sin fechas, los precios no
              vencen.
              {hasItems &&
                ' Los ítems que ya estaban en el catálogo toman la vigencia de esta lista.'}
            </p>
          </div>

          {rangeError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {rangeError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!file || rangeError !== null}>
              <Upload size={15} />
              Importar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

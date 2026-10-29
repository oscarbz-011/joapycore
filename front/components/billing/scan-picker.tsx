'use client';

import { useRef } from 'react';
import { FileImage, Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCAN_TYPES = 'image/*,application/pdf';

/** Escaneo o foto de una hoja física: el adjunto actual, o un botón para elegirlo. */
export function ScanPicker({
  id,
  fileName,
  emptyLabel = 'Adjuntar escaneo o foto',
  uploading = false,
  disabled = false,
  onPick,
  onOpen,
  onRemove,
}: Readonly<{
  id: string;
  fileName: string | null;
  emptyLabel?: string;
  uploading?: boolean;
  disabled?: boolean;
  onPick?: (file: File) => void;
  onOpen?: () => void;
  onRemove?: () => void;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const input = onPick && (
    <input
      ref={inputRef}
      id={id}
      type="file"
      accept={SCAN_TYPES}
      className="sr-only"
      tabIndex={-1}
      disabled={disabled || uploading}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onPick(file);
        e.target.value = '';
      }}
    />
  );

  if (fileName) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/20 px-3 py-2">
        <FileImage size={15} className="shrink-0 text-muted-foreground" />
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 truncate text-left text-sm text-primary hover:underline"
          >
            {fileName}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{fileName}</span>
        )}
        {onPick && (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
          >
            {uploading ? 'Subiendo…' : 'Cambiar'}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={onRemove}
            aria-label="Quitar el escaneo"
            className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <X size={14} />
          </button>
        )}
        {input}
      </div>
    );
  }

  if (!onPick) return <p className="text-sm text-muted-foreground">Sin escaneo adjunto.</p>;

  return (
    <>
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground transition-colors',
          'hover:border-primary/50 hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50',
        )}
      >
        <Paperclip size={15} />
        {uploading ? 'Subiendo…' : emptyLabel}
      </button>
      {input}
    </>
  );
}

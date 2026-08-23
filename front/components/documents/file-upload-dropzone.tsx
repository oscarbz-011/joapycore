'use client';

import { useRef, useState } from 'react';
import { Download, FileText, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploadDropzone({
  currentFile,
  onUpload,
  onRemove,
  onDownload,
  isUploading,
}: {
  currentFile?: { originalName: string; sizeBytes: number } | null;
  onUpload: (file: File) => void;
  onRemove?: () => void;
  onDownload?: () => void;
  isUploading?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  if (currentFile) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-muted-foreground/60 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-foreground truncate">{currentFile.originalName}</p>
            <p className="text-xs text-muted-foreground/60">{formatBytes(currentFile.sizeBytes)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              title="Descargar"
              className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground/60 hover:text-blue-600 transition-colors"
            >
              <Download size={14} />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              title="Quitar archivo"
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onUpload(file);
      }}
      onClick={() => !isUploading && inputRef.current?.click()}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors',
        dragOver ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/20' : 'border-border hover:bg-muted/10',
        isUploading && 'pointer-events-none opacity-60',
      )}
    >
      <Upload size={20} className="text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">
        {isUploading ? (
          'Subiendo...'
        ) : (
          <>Arrastrá un archivo o <span className="text-foreground font-medium underline underline-offset-2">buscá uno</span></>
        )}
      </p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

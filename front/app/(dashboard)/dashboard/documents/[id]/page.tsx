'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Pencil, Save, X, Globe, Lock, ShieldCheck,
  Tag, FileText, Calendar, ExternalLink, Trash2,
} from 'lucide-react';
import {
  documentsApi,
  type DocType,
  type DocVisibility,
  type CreateDocumentPayload,
  TYPE_LABELS,
  VISIBILITY_LABELS,
} from '../../../../../lib/api/documents';
import { RichTextEditor } from '../../../../../components/rich-text-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────

const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

const VISIBILITY_ICON: Record<DocVisibility, React.ElementType> = {
  PUBLIC: Globe, PRIVATE: Lock, ROLE_BASED: ShieldCheck,
};

const TYPE_CHIP: Record<DocType, string> = {
  INTERNAL:   'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  CONTRACT:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  COMPLIANCE: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

const DOC_TYPES: DocType[] = ['INTERNAL', 'CONTRACT', 'COMPLIANCE'];
const DOC_VISIBILITIES: DocVisibility[] = ['PUBLIC', 'PRIVATE', 'ROLE_BASED'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [contentDraft, setContentDraft] = useState<string | undefined>(undefined);
  const [metaForm, setMetaForm] = useState<Partial<CreateDocumentPayload>>({});

  const { data: doc, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => documentsApi.get(id),
    enabled: !!id,
  });

  const saveMeta = useMutation({
    mutationFn: (payload: Partial<CreateDocumentPayload>) =>
      documentsApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document', id] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      setIsEditingMeta(false);
    },
  });

  const saveContent = useMutation({
    mutationFn: (content: string) => documentsApi.update(id, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document', id] });
      setContentDraft(undefined);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => documentsApi.remove(id),
    onSuccess: () => router.push('/dashboard/documents'),
  });

  const handleContentChange = useCallback((json: string) => {
    setContentDraft(json);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground/60">
        Cargando documento...
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <FileText size={40} className="text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Documento no encontrado.</p>
        <button onClick={() => router.back()} className="text-sm font-medium text-foreground underline underline-offset-2">
          Volver
        </button>
      </div>
    );
  }

  const VisIcon = VISIBILITY_ICON[doc.visibility];
  const hasUnsavedContent = contentDraft !== undefined && contentDraft !== doc.content;

  function startEditMeta() {
    setMetaForm({
      type: doc!.type,
      title: doc!.title,
      description: doc!.description ?? '',
      category: doc!.category ?? '',
      visibility: doc!.visibility,
      allowedRoles: doc!.allowedRoles,
      fileUrl: doc!.fileUrl ?? '',
      expiresAt: doc!.expiresAt ? doc!.expiresAt.slice(0, 10) : '',
    });
    setIsEditingMeta(true);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
        <button
          onClick={() => router.push('/dashboard/documents')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          Documentos
        </button>

        <div className="flex items-center gap-2">
          {hasUnsavedContent && (
            <Button
              size="sm"
              onClick={() => saveContent.mutate(contentDraft!)}
              disabled={saveContent.isPending}
            >
              <Save size={14} />
              {saveContent.isPending ? 'Guardando...' : 'Guardar contenido'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={startEditMeta}>
            <Pencil size={14} />
            Editar info
          </Button>
          <button
            onClick={() => {
              if (confirm(`¿Eliminar "${doc.title}"?`)) deleteMutation.mutate();
            }}
            className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Editor area */}
        <div className="flex-1 overflow-y-auto p-6">
          <h1 className="text-2xl font-semibold text-foreground mb-1">{doc.title}</h1>
          {doc.description && (
            <p className="text-sm text-muted-foreground mb-6">{doc.description}</p>
          )}

          <RichTextEditor
            key={doc.id}
            content={doc.content ?? undefined}
            onChange={handleContentChange}
            minHeight={400}
            placeholder="Escribí el contenido de este documento..."
          />

          {hasUnsavedContent && (
            <p className="text-xs text-muted-foreground/60 mt-2">
              Hay cambios sin guardar. Presioná &quot;Guardar contenido&quot; cuando termines.
            </p>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-l border-border bg-muted/20 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-1">Tipo</p>
            <span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', TYPE_CHIP[doc.type])}>
              {TYPE_LABELS[doc.type]}
            </span>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-1">Visibilidad</p>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <VisIcon size={14} />
              {VISIBILITY_LABELS[doc.visibility]}
            </span>
            {doc.allowedRoles.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {doc.allowedRoles.map((r) => (
                  <span key={r} className="bg-muted/50 text-muted-foreground text-xs rounded px-1.5 py-0.5">{r}</span>
                ))}
              </div>
            )}
          </div>

          {doc.category && (
            <div>
              <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-1">Categoría</p>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Tag size={14} />
                {doc.category}
              </span>
            </div>
          )}

          {doc.tags && doc.tags.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-1">Etiquetas</p>
              <div className="flex flex-wrap gap-1">
                {doc.tags.map((tag) => (
                  <span key={tag} className="bg-muted/50 text-muted-foreground rounded-full text-xs px-2 py-0.5">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {doc.fileUrl && (
            <div>
              <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-1">Archivo adjunto</p>
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-foreground underline underline-offset-2"
              >
                <ExternalLink size={13} />
                {doc.fileName ?? 'Ver archivo'}
              </a>
            </div>
          )}

          {doc.expiresAt && (
            <div>
              <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-1">Vencimiento</p>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar size={14} />
                {formatDate(doc.expiresAt)}
              </span>
            </div>
          )}

          <div className="border-t border-border pt-3 space-y-2">
            <div>
              <p className="text-xs text-muted-foreground/60">Creado</p>
              <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground/60">Actualizado</p>
              <p className="text-xs text-muted-foreground">{formatDate(doc.updatedAt)}</p>
            </div>
          </div>
        </aside>
      </div>

      {/* Meta edit modal */}
      {isEditingMeta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setIsEditingMeta(false)}
        >
          <div className="bg-card rounded-2xl border border-border shadow-lg w-full max-w-lg max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-foreground">Editar información</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditingMeta(false)}>
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={metaForm.type ?? 'INTERNAL'} onValueChange={(v) => v && setMetaForm((p) => ({ ...p, type: v as DocType }))}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{TYPE_LABELS[metaForm.type ?? 'INTERNAL']}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input
                  value={metaForm.title ?? ''}
                  onChange={(e) => setMetaForm((p) => ({ ...p, title: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <textarea
                  rows={2}
                  className={TEXTAREA_CLS}
                  value={metaForm.description ?? ''}
                  onChange={(e) => setMetaForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Input
                  value={metaForm.category ?? ''}
                  onChange={(e) => setMetaForm((p) => ({ ...p, category: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Visibilidad</Label>
                <Select value={metaForm.visibility ?? 'PUBLIC'} onValueChange={(vis) => vis && setMetaForm((p) => ({ ...p, visibility: vis as DocVisibility }))}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{VISIBILITY_LABELS[metaForm.visibility ?? 'PUBLIC']}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_VISIBILITIES.map((vis) => <SelectItem key={vis} value={vis}>{VISIBILITY_LABELS[vis]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {metaForm.visibility === 'ROLE_BASED' && (
                <div className="space-y-1.5">
                  <Label>Roles con acceso</Label>
                  <Input
                    value={(metaForm.allowedRoles ?? []).join(', ')}
                    onChange={(e) =>
                      setMetaForm((p) => ({
                        ...p,
                        allowedRoles: e.target.value.split(',').map((r) => r.trim()).filter(Boolean),
                      }))
                    }
                    placeholder="vendedor, supervisor"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>URL del archivo</Label>
                <Input
                  value={metaForm.fileUrl ?? ''}
                  onChange={(e) => setMetaForm((p) => ({ ...p, fileUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Fecha de vencimiento</Label>
                <Input
                  type="date"
                  value={metaForm.expiresAt ?? ''}
                  onChange={(e) => setMetaForm((p) => ({ ...p, expiresAt: e.target.value }))}
                />
              </div>
            </div>

            {saveMeta.isError && (
              <p className="text-destructive text-xs mt-3">
                {(saveMeta.error as Error)?.message ?? 'Error al guardar'}
              </p>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setIsEditingMeta(false)}>Cancelar</Button>
              <Button
                onClick={() => saveMeta.mutate(metaForm)}
                disabled={!metaForm.title || saveMeta.isPending}
              >
                {saveMeta.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

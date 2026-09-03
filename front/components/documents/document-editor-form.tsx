'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft, Braces, Globe, Lock, Save, ShieldCheck, Sparkles, Tag, Trash2, X,
} from 'lucide-react';
import {
  documentsApi,
  extractVariableKeys,
  type CreateDocumentPayload,
  type Document,
  type DocContentFormat,
  type DocType,
  type DocVisibility,
  type TemplateKind,
  CONTENT_FORMAT_LABELS,
  TEMPLATE_KIND_DEFAULT_CONTENT_FORMAT,
  TEMPLATE_KIND_DEFAULT_DOC_TYPE,
  TEMPLATE_KIND_LABELS,
  TYPE_LABELS,
  VISIBILITY_LABELS,
} from '../../lib/api/documents';
import { isApiError } from '../../lib/api/api-error';
import { filesApi } from '../../lib/api/files';
import { downloadBlob } from '../../lib/blob-file';
import { consumeDuplicateSeed } from '../../lib/document-duplicate-seed';
import { RichTextEditor, type RichTextEditorHandle } from '../rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CategorySelect } from './category-select';
import { DocxVariablesReference } from './docx-variables-reference';
import { FileUploadDropzone } from './file-upload-dropzone';
import { HtmlSourceEditor } from './html-source-editor';
import { VariablesPanel } from './variables-panel';

const DOC_TYPES: DocType[] = ['INTERNAL', 'CONTRACT', 'COMPLIANCE', 'BILLING'];
const DOC_VISIBILITIES: DocVisibility[] = ['PUBLIC', 'PRIVATE', 'ROLE_BASED'];
const TEMPLATE_KINDS: TemplateKind[] = ['SALE_CONTRACT', 'INVOICE', 'PAYMENT_RECEIPT'];
const CONTENT_FORMATS: DocContentFormat[] = ['TIPTAP', 'HTML', 'DOCX'];
const NONE = 'none';

const VISIBILITY_ICON: Record<DocVisibility, React.ElementType> = {
  PUBLIC: Globe, PRIVATE: Lock, ROLE_BASED: ShieldCheck,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Página completa de creación/edición — reemplaza el modal de metadata y la
// pantalla de contenido separadas: título, categoría, descripción y contenido
// se editan juntos y se guardan con un único botón, como en la referencia.
export function DocumentEditorForm({
  mode,
  initial,
  initialContentFormat,
}: {
  mode: 'document' | 'template';
  initial?: Document;
  // Solo aplica al crear (initial undefined) — viene del selector previo en
  // templates/new/page.tsx, para no forzar a elegir dos veces.
  initialContentFormat?: DocContentFormat;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const editorRef = useRef<RichTextEditorHandle>(null);
  const isTemplate = mode === 'template';

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState<string | undefined>(initial?.categoryId ?? undefined);
  const [type, setType] = useState<DocType>(initial?.type ?? (isTemplate ? 'CONTRACT' : 'INTERNAL'));
  const [visibility, setVisibility] = useState<DocVisibility>(initial?.visibility ?? 'PRIVATE');
  const [allowedRoles, setAllowedRoles] = useState<string[]>(initial?.allowedRoles ?? []);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ? initial.expiresAt.slice(0, 10) : '');
  const [content, setContent] = useState(initial?.content);
  const [templateKind, setTemplateKind] = useState<TemplateKind | undefined>(initial?.templateKind ?? undefined);
  const [contentFormat, setContentFormat] = useState<DocContentFormat>(
    initial?.contentFormat ?? initialContentFormat ?? 'TIPTAP',
  );
  // Para DOCX + plantilla nueva: el archivo se guarda en memoria hasta que el
  // documento exista (necesita un id para el endpoint de adjuntar), en vez de
  // obligar a un "Guardar" intermedio antes de poder elegir el archivo.
  const [pendingDocxFile, setPendingDocxFile] = useState<File | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  const handleContentChange = useCallback((json: string) => setContent(json), []);

  function handleTemplateKindChange(kind: TemplateKind | undefined) {
    setTemplateKind(kind);
    // Solo sugerimos el Tipo/Formato al crear una plantilla nueva — al editar
    // una ya guardada no queremos pisar valores que el usuario eligió a propósito.
    if (!initial && kind) {
      setType(TEMPLATE_KIND_DEFAULT_DOC_TYPE[kind]);
      setContentFormat(TEMPLATE_KIND_DEFAULT_CONTENT_FORMAT[kind]);
    }
  }

  // Solo puede haber una plantilla activa por tenant para cada uso
  // automático (factura, recibo, contrato de venta) — se avisa antes de
  // guardar, con un link directo, en vez de solo mostrar el 409 después.
  const { data: existingTemplatesForKind = [] } = useQuery({
    queryKey: ['documents', 'template-conflict-check', templateKind],
    queryFn: () => documentsApi.list({ isTemplate: true, templateKind }),
    enabled: isTemplate && !!templateKind,
  });
  const conflictingTemplate = existingTemplatesForKind.find((d) => d.id !== initial?.id);

  // "Duplicar" navega acá con los datos del documento origen en sessionStorage.
  useEffect(() => {
    if (initial) return;
    const seed = consumeDuplicateSeed();
    if (!seed) return;
    if (seed.type) setType(seed.type);
    if (seed.title) setTitle(seed.title);
    if (seed.description !== undefined) setDescription(seed.description);
    if (seed.categoryId !== undefined) setCategoryId(seed.categoryId);
    if (seed.tags) setTags(seed.tags);
    if (seed.visibility) setVisibility(seed.visibility);
    if (seed.allowedRoles) setAllowedRoles(seed.allowedRoles);
    if (seed.content !== undefined) setContent(seed.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadFileMutation = useMutation({
    mutationFn: (file: File) => documentsApi.uploadFile(initial!.id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document', initial!.id] }),
  });

  const removeFileMutation = useMutation({
    mutationFn: () => documentsApi.removeFile(initial!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document', initial!.id] }),
  });

  const downloadFileMutation = useMutation({
    mutationFn: async () => {
      const blob = await filesApi.downloadBlob(initial!.fileRecord!.id);
      downloadBlob(blob, initial!.fileRecord!.originalName);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => documentsApi.remove(initial!.id),
    onSuccess: () => router.push(isTemplate ? '/dashboard/documents/templates' : '/dashboard/documents'),
  });

  const saveMutation = useMutation({
    mutationFn: async (opts?: { replaceActiveTemplate?: boolean }) => {
      const payload: CreateDocumentPayload = {
        type,
        title: title.trim(),
        description: description || undefined,
        categoryId,
        tags,
        visibility,
        allowedRoles: visibility === 'ROLE_BASED' ? allowedRoles : [],
        expiresAt: expiresAt || undefined,
        content,
        contentFormat,
        isTemplate,
        templateKind: isTemplate ? templateKind : undefined,
        replaceActiveTemplate: opts?.replaceActiveTemplate,
      };
      if (initial) return documentsApi.update(initial.id, payload);

      const doc = await documentsApi.create(payload);
      // El .docx elegido antes de guardar recién se puede subir con el id
      // que devuelve create() — se encadena acá para que quede todo en un
      // solo "Guardar" en vez de un segundo paso manual.
      if (contentFormat === 'DOCX' && pendingDocxFile) {
        return documentsApi.uploadFile(doc.id, pendingDocxFile);
      }
      return doc;
    },
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['document', doc.id] });
      if (!initial) {
        router.replace(`/dashboard/documents/${doc.id}`);
      }
    },
  });

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((p) => [...p, t]);
    setTagInput('');
  }

  const backHref = isTemplate ? '/dashboard/documents/templates' : '/dashboard/documents';
  const variableCount = contentFormat === 'DOCX'
    ? (initial?.variables?.length ?? 0)
    : extractVariableKeys(content).length;
  const VisIcon = VISIBILITY_ICON[visibility];
  // Bloquea "Guardar" mientras haya otra plantilla activa para el mismo uso —
  // guardar así fallaría con 409 igual; obliga a resolverlo acá (con
  // "Reemplazar" o eligiendo otro uso) en vez de dejar clickear en falso.
  const hasUnresolvedConflict = isTemplate && !!templateKind && !!conflictingTemplate;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-6 py-3">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="flex shrink-0 items-center gap-2 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} />
          {isTemplate ? 'Plantillas' : 'Documentos'}
        </button>

        <span className="hidden flex-1 items-center gap-1.5 truncate text-[12.5px] text-muted-foreground/70 sm:flex">
          <Braces size={12} />
          {variableCount} variable{variableCount !== 1 ? 's' : ''} detectada{variableCount !== 1 ? 's' : ''}
        </span>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(undefined)}
            disabled={!title.trim() || saveMutation.isPending || hasUnresolvedConflict}
          >
            <Save size={14} />
            {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
          {initial && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`¿Eliminar "${initial.title}"?`)) deleteMutation.mutate();
              }}
              className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {saveMutation.isError && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-6 py-2.5 text-[13px] text-destructive">
          {isApiError(saveMutation.error) ? saveMutation.error.message : 'No se pudo guardar. Intentá de nuevo.'}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isTemplate && (
            <span className="mb-3 flex w-fit items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 text-[11px] font-semibold text-accent-on">
              <Sparkles size={11} />
              Plantilla
            </span>
          )}

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isTemplate ? 'Ej: Contrato de compra-venta estándar' : 'Nombre del documento'}
                className="text-[15px] font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Categoría</Label>
              <CategorySelect value={categoryId} onChange={setCategoryId} />
            </div>
          </div>

          <div className="mb-5 space-y-1.5">
            <Label className="text-[12px]">Descripción</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isTemplate ? 'Breve descripción de para qué sirve la plantilla' : 'Descripción opcional'}
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Tipo</Label>
              <Select value={type} onValueChange={(v) => v && setType(v as DocType)}>
                <SelectTrigger className="w-full">
                  <span className="min-w-0 flex-1 truncate text-left text-sm">{TYPE_LABELS[type]}</span>
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Visibilidad</Label>
              <Select value={visibility} onValueChange={(v) => v && setVisibility(v as DocVisibility)}>
                <SelectTrigger className="w-full">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm">
                    <VisIcon size={13} />
                    {VISIBILITY_LABELS[visibility]}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {DOC_VISIBILITIES.map((v) => <SelectItem key={v} value={v}>{VISIBILITY_LABELS[v]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!isTemplate && (
              <div className="space-y-1.5">
                <Label className="text-[12px]">Vencimiento</Label>
                <DatePicker value={expiresAt} onChange={setExpiresAt} />
              </div>
            )}
          </div>

          {visibility === 'ROLE_BASED' && (
            <div className="mb-6 space-y-1.5">
              <Label className="text-[12px]">Roles con acceso (separados por coma)</Label>
              <Input
                value={allowedRoles.join(', ')}
                onChange={(e) => setAllowedRoles(e.target.value.split(',').map((r) => r.trim()).filter(Boolean))}
                placeholder="ej: vendedor, supervisor"
              />
            </div>
          )}

          <div className="mb-6 space-y-1.5">
            <Label className="text-[12px]">Etiquetas</Label>
            <div className="mb-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                  {tag}
                  <button type="button" onClick={() => setTags((p) => p.filter((t) => t !== tag))} className="hover:text-destructive">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Agregar etiqueta..."
              />
              <Button type="button" variant="outline" size="sm" onClick={addTag}>+</Button>
            </div>
          </div>

          {contentFormat === 'DOCX' ? (
            <div className="space-y-3">
              {initial ? (
                <FileUploadDropzone
                  currentFile={initial.fileRecord}
                  isUploading={uploadFileMutation.isPending}
                  onUpload={(file) => uploadFileMutation.mutate(file)}
                  onRemove={() => {
                    if (confirm('¿Quitar el archivo .docx?')) removeFileMutation.mutate();
                  }}
                  onDownload={() => downloadFileMutation.mutate()}
                />
              ) : (
                <FileUploadDropzone
                  currentFile={pendingDocxFile ? { originalName: pendingDocxFile.name, sizeBytes: pendingDocxFile.size } : null}
                  onUpload={(file) => setPendingDocxFile(file)}
                  onRemove={() => setPendingDocxFile(null)}
                />
              )}
              {!initial && !pendingDocxFile && (
                <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                  Se sube al guardar la plantilla — no hace falta guardar antes.
                </p>
              )}

              {isTemplate && <DocxVariablesReference templateKind={templateKind} />}

              {initial?.fileRecord && (
                <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
                  <Label className="text-[12px]">Variables detectadas</Label>
                  {initial.variables && initial.variables.length > 0 ? (
                    <div className="space-y-1.5">
                      {initial.variables.map((v) => (
                        <div
                          key={v.key}
                          className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5"
                        >
                          <span className="truncate font-mono text-[12px] text-foreground">{`{{${v.key}}}`}</span>
                          <Badge variant="outline" className="shrink-0">
                            {v.type === 'table' ? 'tabla' : 'texto'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                      No se detectaron variables {'{{...}}'} en este archivo.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : contentFormat === 'HTML' ? (
            <HtmlSourceEditor
              ref={editorRef}
              key={initial?.id ?? 'new'}
              content={content}
              onChange={handleContentChange}
              minHeight={600}
              placeholder="Escribí el HTML/CSS de la plantilla. Usá el panel para insertar variables como {{cliente.nombre}}."
            />
          ) : (
            <RichTextEditor
              ref={editorRef}
              key={initial?.id ?? 'new'}
              content={content}
              onChange={handleContentChange}
              minHeight={600}
              placeholder={isTemplate ? 'Escribí la plantilla. Usá el panel para insertar variables como {{cliente.nombre}}.' : 'Escribí el contenido de este documento...'}
            />
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-muted/20 p-4 space-y-4">
          {isTemplate ? (
            <>
              <div className="rounded-2xl border border-border bg-card p-3 space-y-2.5">
                <Label className="text-[12px]">Uso automático</Label>
                <Select
                  value={templateKind ?? NONE}
                  onValueChange={(v) => handleTemplateKindChange(v === NONE ? undefined : (v as TemplateKind))}
                >
                  <SelectTrigger className="w-full">
                    <span className="min-w-0 flex-1 truncate text-left text-sm">
                      {templateKind ? TEMPLATE_KIND_LABELS[templateKind] : 'Plantilla genérica (sin uso automático)'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Plantilla genérica (sin uso automático)</SelectItem>
                    {TEMPLATE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>{TEMPLATE_KIND_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                  Si elegís un uso automático, esta plantilla se usa para generar el documento correspondiente
                  {templateKind === 'SALE_CONTRACT' && ' cuando se emite la factura de una venta a crédito'}
                  {templateKind === 'INVOICE' && ' cada vez que se emite una factura'}
                  {templateKind === 'PAYMENT_RECEIPT' && ' cada vez que se cobra una cuota'}
                  .
                </p>
                {contentFormat === 'HTML' && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                    Este uso automático edita HTML/CSS directo (no el editor visual) — necesita layout exacto que el editor de texto enriquecido no puede dar.
                  </p>
                )}
                {templateKind && conflictingTemplate && (
                  <div className="space-y-2 rounded-lg bg-warn/10 p-2.5">
                    <p className="text-[11px] leading-relaxed text-warn">
                      Ya existe una plantilla activa para esto: <strong>{conflictingTemplate.title}</strong>.{' '}
                      <Link href={`/dashboard/documents/${conflictingTemplate.id}`} className="underline underline-offset-2">
                        Editá esa
                      </Link>{' '}
                      o elegí otro uso para guardar esta como plantilla genérica.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={saveMutation.isPending || !title.trim()}
                      onClick={() => setShowReplaceConfirm(true)}
                    >
                      Reemplazar plantilla activa
                    </Button>
                  </div>
                )}
                {templateKind && !conflictingTemplate && (
                  <p className="text-[11px] text-muted-foreground/70">
                    Solo puede haber una plantilla activa para esto por tenant.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-3 space-y-2.5">
                <Label className="text-[12px]">Formato de contenido</Label>
                <Select
                  value={contentFormat}
                  onValueChange={(v) => v && setContentFormat(v as DocContentFormat)}
                >
                  <SelectTrigger className="w-full">
                    <span className="min-w-0 flex-1 truncate text-left text-sm">{CONTENT_FORMAT_LABELS[contentFormat]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_FORMATS.map((f) => (
                      <SelectItem key={f} value={f}>{CONTENT_FORMAT_LABELS[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {contentFormat === 'DOCX' && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                    Subí un archivo .docx con variables como <code className="font-mono">{'{{cliente.nombre}}'}</code>.
                    El archivo es el contenido — no hay editor visual para este formato.
                  </p>
                )}
              </div>

              {contentFormat !== 'DOCX' && (
                <VariablesPanel
                  templateKind={templateKind}
                  content={content}
                  onInsert={(token) => editorRef.current?.insertToken(token)}
                />
              )}
            </>
          ) : (
            <>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">Archivo adjunto</p>
                {initial ? (
                  <FileUploadDropzone
                    currentFile={initial.fileRecord}
                    isUploading={uploadFileMutation.isPending}
                    onUpload={(file) => uploadFileMutation.mutate(file)}
                    onRemove={() => {
                      if (confirm('¿Quitar el archivo adjunto?')) removeFileMutation.mutate();
                    }}
                    onDownload={() => downloadFileMutation.mutate()}
                  />
                ) : (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground/70">
                    Guardá el documento para poder adjuntar un archivo.
                  </p>
                )}
              </div>

              <VariablesPanel
                content={content}
                onInsert={(token) => editorRef.current?.insertToken(token)}
              />

              {initial && (
                <div className="space-y-2 border-t border-border pt-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground/60">Creado</p>
                    <p className="text-[12px] text-muted-foreground">{formatDate(initial.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground/60">Actualizado</p>
                    <p className="text-[12px] text-muted-foreground">{formatDate(initial.updatedAt)}</p>
                  </div>
                </div>
              )}

              {initial?.entityType && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">Vinculado a</p>
                  <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <Tag size={13} />
                    {initial.entityType} · {initial.entityId}
                  </span>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {conflictingTemplate && templateKind && (
        <Dialog open={showReplaceConfirm} onOpenChange={setShowReplaceConfirm}>
          <DialogContent className="sm:max-w-md">
            <DialogTitle>Reemplazar plantilla activa</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{conflictingTemplate.title}</strong> deja de usarse automáticamente
              para <strong className="text-foreground">{TEMPLATE_KIND_LABELS[templateKind]}</strong> — esta plantilla
              toma su lugar.
            </DialogDescription>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowReplaceConfirm(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setShowReplaceConfirm(false);
                  saveMutation.mutate({ replaceActiveTemplate: true });
                }}
              >
                Reemplazar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

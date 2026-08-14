'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Plus, Trash2, Pencil, Search, ExternalLink,
  ShieldCheck, Globe, Lock, Tag, X, Eye,
} from 'lucide-react';
import {
  documentsApi,
  type Document,
  type DocType,
  type DocVisibility,
  type CreateDocumentPayload,
  TYPE_LABELS,
  VISIBILITY_LABELS,
} from '../../../../lib/api/documents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────

const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_CHIP: Record<DocType, string> = {
  INTERNAL:   'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  CONTRACT:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  COMPLIANCE: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

const VISIBILITY_ICON: Record<DocVisibility, React.ElementType> = {
  PUBLIC:     Globe,
  PRIVATE:    Lock,
  ROLE_BASED: ShieldCheck,
};

const DOC_TYPES: DocType[] = ['INTERNAL', 'CONTRACT', 'COMPLIANCE'];
const DOC_VISIBILITIES: DocVisibility[] = ['PUBLIC', 'PRIVATE', 'ROLE_BASED'];

// ── Form modal ─────────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateDocumentPayload = {
  type: 'INTERNAL',
  title: '',
  description: '',
  category: '',
  tags: [],
  visibility: 'PRIVATE',
  allowedRoles: [],
  fileUrl: '',
  fileName: '',
  entityType: '',
  entityId: '',
  expiresAt: '',
};

function DocumentModal({
  initial,
  onClose,
  onCreated,
}: {
  initial?: Document;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateDocumentPayload>(
    initial
      ? {
          type: initial.type,
          title: initial.title,
          description: initial.description ?? '',
          category: initial.category ?? '',
          tags: initial.tags ?? [],
          visibility: initial.visibility,
          allowedRoles: initial.allowedRoles ?? [],
          fileUrl: initial.fileUrl ?? '',
          fileName: initial.fileName ?? '',
          entityType: initial.entityType ?? '',
          entityId: initial.entityId ?? '',
          expiresAt: initial.expiresAt ? initial.expiresAt.slice(0, 10) : '',
        }
      : EMPTY_FORM,
  );
  const [tagInput, setTagInput] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      initial
        ? documentsApi.update(initial.id, { ...form, expiresAt: form.expiresAt || undefined })
        : documentsApi.create({ ...form, expiresAt: form.expiresAt || undefined }),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      if (!initial && onCreated) {
        onCreated(doc.id);
      } else {
        onClose();
      }
    },
  });

  function addTag() {
    const t = tagInput.trim();
    if (t && !form.tags?.includes(t)) {
      setForm((p) => ({ ...p, tags: [...(p.tags ?? []), t] }));
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setForm((p) => ({ ...p, tags: (p.tags ?? []).filter((t) => t !== tag) }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-2xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-foreground">
            {initial ? 'Editar documento' : 'Nuevo documento'}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={form.type} onValueChange={(v) => v && setForm((p) => ({ ...p, type: v as DocType }))}>
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">{TYPE_LABELS[form.type as DocType] ?? form.type}</span>
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Nombre del documento"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <textarea
              rows={2}
              className={TEXTAREA_CLS}
              value={form.description ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Input
              value={form.category ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              placeholder="Ej: Contratos vigentes"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Etiquetas</Label>
            <div className="flex gap-2 flex-wrap mb-2">
              {(form.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 bg-muted/50 text-muted-foreground rounded-full px-2 py-0.5 text-xs"
                >
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-destructive">
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

          <div className="space-y-1.5">
            <Label>Visibilidad *</Label>
            <Select value={form.visibility} onValueChange={(v) => v && setForm((p) => ({ ...p, visibility: v as DocVisibility }))}>
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">{VISIBILITY_LABELS[form.visibility as DocVisibility] ?? form.visibility}</span>
              </SelectTrigger>
              <SelectContent>
                {DOC_VISIBILITIES.map((v) => (
                  <SelectItem key={v} value={v}>{VISIBILITY_LABELS[v]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.visibility === 'ROLE_BASED' && (
            <div className="space-y-1.5">
              <Label>Roles con acceso (separados por coma)</Label>
              <Input
                value={(form.allowedRoles ?? []).join(', ')}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    allowedRoles: e.target.value.split(',').map((r) => r.trim()).filter(Boolean),
                  }))
                }
                placeholder="ej: vendedor, supervisor"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>URL del archivo</Label>
            <Input
              value={form.fileUrl ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, fileUrl: e.target.value }))}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Nombre del archivo</Label>
            <Input
              value={form.fileName ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, fileName: e.target.value }))}
              placeholder="contrato-cliente.pdf"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo de entidad</Label>
              <Input
                value={form.entityType ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, entityType: e.target.value }))}
                placeholder="customer"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ID de entidad</Label>
              <Input
                value={form.entityId ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, entityId: e.target.value }))}
                placeholder="uuid..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Fecha de vencimiento</Label>
            <Input
              type="date"
              value={form.expiresAt ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
            />
          </div>
        </div>

        {mutation.isError && (
          <p className="text-destructive text-xs mt-3">
            {(mutation.error as Error)?.message ?? 'Error al guardar'}
          </p>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.title || mutation.isPending}
          >
            {mutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear documento'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Document card ──────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  onView,
  onEdit,
  onDelete,
}: {
  doc: Document;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const VisIcon = VISIBILITY_ICON[doc.visibility];
  const isExpiringSoon = doc.expiresAt
    ? (new Date(doc.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 30
    : false;

  return (
    <div className="bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-shadow flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-muted-foreground/60 shrink-0" />
          <span className="font-medium text-sm text-foreground truncate">{doc.title}</span>
        </div>
        <span className={cn('shrink-0 text-xs font-medium px-2 py-0.5 rounded-full', TYPE_CHIP[doc.type])}>
          {TYPE_LABELS[doc.type]}
        </span>
      </div>

      {doc.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{doc.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <VisIcon size={12} />
          {VISIBILITY_LABELS[doc.visibility]}
        </span>
        {doc.category && (
          <span className="flex items-center gap-1">
            <Tag size={12} />
            {doc.category}
          </span>
        )}
        {doc.fileName && <span className="text-muted-foreground/60">{doc.fileName}</span>}
        {doc.fileSizeBytes && <span className="text-muted-foreground/60">{formatBytes(doc.fileSizeBytes)}</span>}
        {doc.expiresAt && (
          <span className={cn('font-medium', isExpiringSoon ? 'text-orange-600' : '')}>
            Vence: {formatDate(doc.expiresAt)}
          </span>
        )}
      </div>

      {doc.tags && doc.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {doc.tags.map((tag) => (
            <span
              key={tag}
              className="bg-muted/30 text-muted-foreground rounded-full px-2 py-0.5 text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground/60">{formatDate(doc.createdAt)}</span>
        <div className="flex items-center gap-1">
          {doc.fileUrl && (
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-muted/20 text-muted-foreground/60 hover:text-blue-600 transition-colors"
              title="Ver archivo adjunto"
            >
              <ExternalLink size={14} />
            </a>
          )}
          <button
            onClick={onView}
            title="Abrir documento"
            className="p-1.5 rounded-lg hover:bg-muted/20 text-muted-foreground/60 hover:text-blue-600 transition-colors"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={onEdit}
            title="Editar información"
            className="p-1.5 rounded-lg hover:bg-muted/20 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            title="Eliminar"
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocType | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editDoc, setEditDoc] = useState<Document | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents', typeFilter, search],
    queryFn: () =>
      documentsApi.list({
        type: typeFilter || undefined,
        search: search || undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });

  const counts: Partial<Record<DocType, number>> = {};
  docs.forEach((d) => { counts[d.type] = (counts[d.type] ?? 0) + 1; });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Documentos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {docs.length} documento{docs.length !== 1 ? 's' : ''} encontrado{docs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => { setEditDoc(null); setShowModal(true); }}>
          <Plus size={16} />
          Nuevo documento
        </Button>
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-2">
        {DOC_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-colors border',
              typeFilter === type
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-foreground border-border hover:bg-muted/20',
            )}
          >
            {TYPE_LABELS[type]}
            {counts[type] !== undefined && (
              <span className={cn('ml-2 text-xs', typeFilter === type ? 'opacity-80' : 'text-muted-foreground/60')}>
                {counts[type]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          className="pl-9"
          placeholder="Buscar por título, descripción o categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground/60">Cargando documentos...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText size={40} className="mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {search || typeFilter
              ? 'No se encontraron documentos con ese filtro.'
              : 'Aún no hay documentos registrados.'}
          </p>
          {!search && !typeFilter && (
            <button
              onClick={() => { setEditDoc(null); setShowModal(true); }}
              className="text-sm font-medium text-foreground underline underline-offset-2"
            >
              Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onView={() => router.push(`/dashboard/documents/${doc.id}`)}
              onEdit={() => { setEditDoc(doc); setShowModal(true); }}
              onDelete={() => {
                if (confirm(`¿Eliminar "${doc.title}"?`)) {
                  deleteMutation.mutate(doc.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {showModal && (
        <DocumentModal
          initial={editDoc ?? undefined}
          onClose={() => { setShowModal(false); setEditDoc(null); }}
          onCreated={(id) => router.push(`/dashboard/documents/${id}`)}
        />
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Braces, Paperclip, ArrowUpRight, Copy, Trash2,
  MoreVertical, Search, SlidersHorizontal, Sparkles,
} from 'lucide-react';
import {
  documentsApi,
  countTemplateVariables,
  type Document,
  type DocType,
  TYPE_LABELS,
} from '../../lib/api/documents';
import { writeDuplicateSeed } from '../../lib/document-duplicate-seed';
import { formatDatePY } from '../../lib/date';
import { GenerateDocumentDialog } from './generate-document-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { daysOverdue } from '@/lib/overdue';


const DOC_TYPES: DocType[] = ['INTERNAL', 'CONTRACT', 'COMPLIANCE'];

// ── Card ───────────────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  isTemplate,
  onOpen,
  onDuplicate,
  onDelete,
  onGenerate,
}: {
  doc: Document;
  isTemplate: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGenerate: () => void;
}) {
  const variableCount = isTemplate
    ? doc.contentFormat === 'DOCX'
      ? (doc.variables?.length ?? 0)
      : countTemplateVariables(doc.content)
    : 0;
  const isExpiringSoon = doc.expiresAt ? -daysOverdue(doc.expiresAt) <= 30 : false;

  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:border-border-strong hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        {doc.category ? (
          <span className="w-fit rounded-full bg-accent-subtle px-2.5 py-0.5 text-[11px] font-semibold text-accent-on">
            {doc.category.name}
          </span>
        ) : <span />}

        <DropdownMenu>
          <DropdownMenuTrigger className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-muted-foreground/50 opacity-0 transition-colors hover:bg-muted/40 hover:text-foreground group-hover:opacity-100 data-[popup-open]:opacity-100">
            <MoreVertical size={15} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isTemplate && doc.contentFormat === 'DOCX' && (
              <DropdownMenuItem onClick={onGenerate}>
                <Sparkles size={14} />
                Generar
              </DropdownMenuItem>
            )}
            {!isTemplate && (
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy size={14} />
                Duplicar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 size={14} />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <h3 className="text-[14.5px] font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
          {doc.title}
        </h3>
        {doc.description && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground line-clamp-2">
            {doc.description}
          </p>
        )}
      </button>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
        {isTemplate && (
          <span className="flex items-center gap-1 font-medium">
            <Braces size={12} />
            {variableCount} variable{variableCount !== 1 ? 's' : ''}
          </span>
        )}
        {doc.fileRecord && (
          <span className="flex items-center gap-1 truncate">
            <Paperclip size={12} className="shrink-0" />
            <span className="truncate">{doc.fileRecord.originalName}</span>
          </span>
        )}
        {doc.expiresAt && (
          <span className={cn('font-medium', isExpiringSoon && 'text-warn')}>
            Vence {formatDatePY(doc.expiresAt, 'utc')}
          </span>
        )}
      </div>

      {doc.tags && doc.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {doc.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-3 border-t border-border">
        <Button size="sm" className="w-full" onClick={onOpen}>
          <ArrowUpRight size={13} />
          Abrir
        </Button>
      </div>
    </div>
  );
}

// ── Grid ───────────────────────────────────────────────────────────────────────

export function DocumentGrid({ mode }: { mode: 'document' | 'template' }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocType | ''>('');
  const [generateTarget, setGenerateTarget] = useState<Document | null>(null);

  const isTemplate = mode === 'template';
  const newHref = isTemplate ? '/dashboard/documents/templates/new' : '/dashboard/documents/new';

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents', mode, typeFilter, search],
    queryFn: () =>
      documentsApi.list({
        type: typeFilter || undefined,
        search: search || undefined,
        isTemplate,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });

  const counts: Partial<Record<DocType, number>> = {};
  docs.forEach((d) => { counts[d.type] = (counts[d.type] ?? 0) + 1; });

  function duplicate(doc: Document) {
    writeDuplicateSeed({
      type: doc.type,
      title: `${doc.title} (copia)`,
      description: doc.description ?? '',
      categoryId: doc.categoryId ?? undefined,
      tags: doc.tags,
      visibility: doc.visibility,
      allowedRoles: doc.allowedRoles,
      content: doc.content,
    });
    router.push(newHref);
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            className="pl-8"
            placeholder={isTemplate ? 'Buscar plantilla...' : 'Buscar por título, descripción o categoría...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="shrink-0 text-muted-foreground/50" />
          <Select
            value={typeFilter || null}
            onValueChange={(v: string | null) => setTypeFilter(v === 'all' || v === null ? '' : (v as DocType))}
          >
            <SelectTrigger className="w-44 overflow-hidden">
              <span className="min-w-0 flex-1 truncate text-left text-sm">
                {typeFilter ? TYPE_LABELS[typeFilter] : 'Todos los tipos'}
              </span>
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[10rem]">
              <SelectItem value="all">Todos los tipos</SelectItem>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}{counts[t] !== undefined ? ` (${counts[t]})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-16 text-center text-[13.5px] text-muted-foreground">Cargando...</div>
      ) : docs.length === 0 ? (
        <div className="py-16 text-center">
          <FileText size={36} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-[13.5px] text-muted-foreground">
            {search || typeFilter
              ? 'No se encontraron resultados con ese filtro.'
              : isTemplate
                ? 'Aún no hay plantillas configuradas.'
                : 'Aún no hay documentos registrados.'}
          </p>
          {!search && !typeFilter && (
            <Button variant="link" className="mt-2 text-accent-on" onClick={() => router.push(newHref)}>
              {isTemplate ? 'Crear la primera plantilla' : 'Crear el primero'}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              isTemplate={isTemplate}
              onOpen={() => router.push(`/dashboard/documents/${doc.id}`)}
              onDuplicate={() => duplicate(doc)}
              onDelete={() => {
                if (confirm(`¿Eliminar "${doc.title}"?`)) deleteMutation.mutate(doc.id);
              }}
              onGenerate={() => setGenerateTarget(doc)}
            />
          ))}
        </div>
      )}

      {generateTarget && (
        <GenerateDocumentDialog
          doc={generateTarget}
          open={!!generateTarget}
          onOpenChange={(v) => !v && setGenerateTarget(null)}
        />
      )}
    </div>
  );
}

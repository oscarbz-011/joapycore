"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookPen, Plus, RotateCcw, Search, Star, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TablePagination } from "@/components/table-pagination";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { apiErrorMessage } from "@/lib/api/api-error";
import { notesApi, type NotePriority, type NoteView, type UserNote } from "@/lib/api/notes";
import {
  NOTES_PATH,
  NOTE_VIEWS,
  PRIORITIES,
  countByPriority,
  filterNotes,
  noteDate,
  parseView,
  priorityOf,
} from "@/lib/notes";
import { usePagination } from "@/lib/use-pagination";

export default function NotesPage() {
  return (
    <Suspense fallback={null}>
      <Notes />
    </Suspense>
  );
}

function Notes() {
  const router = useRouter();
  const view = parseView(useSearchParams().get("view"));
  const { jwtPayload } = useAuth();
  const key = ["notes", jwtPayload?.tenantId, jwtPayload?.sub] as const;
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<NotePriority | null>(null);
  const list = useQuery({
    queryKey: [...key, view],
    queryFn: () => notesApi.list(view),
  });
  const shown = filterNotes(list.data ?? [], search, priority);
  const counts = countByPriority(list.data ?? []);
  const pagination = usePagination(shown, 12);
  const setView = (next: NoteView) =>
    router.replace(next === "all" ? NOTES_PATH : `${NOTES_PATH}?view=${next}`, { scroll: false });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Notas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus apuntes personales. Solo vos los ves.
          </p>
        </div>
        <Link href={`${NOTES_PATH}/new`} className={cn(buttonVariants())}>
          <Plus size={15} /> Nueva nota
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Filtros de notas" className="flex flex-wrap content-start gap-x-1 gap-y-3 lg:flex-col lg:flex-nowrap">
          <div className="flex flex-wrap gap-1 lg:flex-col">
            {NOTE_VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setView(item.id)}
                className={cn(
                  "rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  view === item.id
                    ? "bg-[var(--accent-soft)] font-medium text-[var(--accent-text)]"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1 lg:flex-col lg:items-stretch">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 max-lg:hidden">
              Prioridad
            </p>
            {PRIORITIES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={priority === item.id}
                onClick={() => setPriority(priority === item.id ? null : item.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  priority === item.id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: item.color }} />
                <span className="flex-1">{item.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{counts[item.id]}</span>
              </button>
            ))}
          </div>
        </nav>

        <section aria-label="Notas" className="min-w-0 space-y-4">
          <div className="relative max-w-md">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Buscar en las notas"
              placeholder="Buscar en el título o el texto"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-8"
            />
          </div>

          {list.isPending && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-36 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          )}
          {list.error && (
            <div className="space-y-3">
              <p
                role="alert"
                className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {apiErrorMessage(list.error, "No se pudieron cargar las notas.")}
              </p>
              <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
                Reintentar notas
              </Button>
            </div>
          )}
          {list.data && shown.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              <NotebookPen size={26} />
              <p>
                {list.data.length > 0
                  ? "Ninguna nota coincide con los filtros."
                  : view === "trash"
                    ? "La papelera está vacía."
                    : view === "starred"
                      ? "Todavía no destacaste ninguna nota."
                      : "Todavía no tenés notas. Creá la primera."}
              </p>
            </div>
          )}

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pagination.items.map((note) => (
              <li key={note.id}>
                <NoteCard note={note} queryKey={key} />
              </li>
            ))}
          </ul>
          {shown.length > 0 && <TablePagination {...pagination.controls} label="notas" />}
        </section>
      </div>
    </div>
  );
}

function NoteCard({ note, queryKey }: { note: UserNote; queryKey: readonly unknown[] }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey });
  const star = useMutation({
    mutationFn: () => notesApi.update(note.id, { starred: !note.starred }),
    onSuccess: refresh,
  });
  const trash = useMutation({ mutationFn: () => notesApi.trash(note.id), onSuccess: refresh });
  const restore = useMutation({ mutationFn: () => notesApi.restore(note.id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => notesApi.remove(note.id), onSuccess: refresh });
  const priority = priorityOf(note.priority);
  const trashed = note.trashedAt !== null;
  const failure = star.error ?? trash.error ?? restore.error ?? remove.error;

  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{
            color: priority.color,
            background: `color-mix(in srgb, ${priority.color} 14%, transparent)`,
          }}
        >
          {priority.label}
        </span>
        <time dateTime={note.updatedAt} className="text-[11px] text-muted-foreground">
          {noteDate(note.updatedAt)}
        </time>
      </header>

      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="break-words text-sm font-semibold">
          {trashed ? (
            note.title
          ) : (
            <Link href={`${NOTES_PATH}/${note.id}`} className="hover:underline">
              {note.title}
            </Link>
          )}
        </h2>
        {note.body && (
          <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {note.body}
          </p>
        )}
      </div>

      {failure ? (
        <p role="alert" className="text-xs text-destructive">
          {apiErrorMessage(failure, "No se pudo completar la operación.")}
        </p>
      ) : null}

      <footer className="flex flex-wrap items-center gap-1">
        {trashed ? (
          confirming ? (
            <>
              <span className="mr-1 text-xs">¿Eliminar para siempre?</span>
              <Button
                size="xs"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Sí, eliminar
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
                No
              </Button>
            </>
          ) : (
            <>
              <Button
                size="xs"
                variant="outline"
                disabled={restore.isPending}
                onClick={() => restore.mutate()}
              >
                <RotateCcw size={12} /> Restaurar
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirming(true)}>
                Eliminar
              </Button>
            </>
          )
        ) : (
          <>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={note.starred ? "Quitar de destacadas" : "Destacar"}
              aria-pressed={note.starred}
              disabled={star.isPending}
              onClick={() => star.mutate()}
            >
              <Star
                size={14}
                fill={note.starred ? "var(--warn)" : "none"}
                stroke={note.starred ? "var(--warn)" : "currentColor"}
              />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Enviar a la papelera"
              disabled={trash.isPending}
              onClick={() => trash.mutate()}
            >
              <Trash2 size={14} />
            </Button>
          </>
        )}
      </footer>
    </article>
  );
}

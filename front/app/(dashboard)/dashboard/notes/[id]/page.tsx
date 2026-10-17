"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { NoteForm } from "@/components/notes/note-form";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { apiErrorMessage } from "@/lib/api/api-error";
import { notesApi, type NoteInput } from "@/lib/api/notes";
import { NOTES_PATH, noteChanges, noteDate } from "@/lib/notes";

export default function NotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const key = ["notes", jwtPayload?.tenantId, jwtPayload?.sub] as const;
  const note = useQuery({
    queryKey: [...key, "detail", id],
    queryFn: () => notesApi.get(id),
  });
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    router.push(NOTES_PATH);
  };
  const original: NoteInput | null = note.data
    ? {
        title: note.data.title,
        body: note.data.body,
        priority: note.data.priority,
        starred: note.data.starred,
      }
    : null;
  const save = useMutation({
    mutationFn: async (form: NoteInput) => {
      const changes = original && noteChanges(original, form);
      if (changes) await notesApi.update(id, changes);
    },
    onSuccess: done,
  });
  const trash = useMutation({ mutationFn: () => notesApi.trash(id), onSuccess: done });

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={NOTES_PATH}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Notas
        </Link>
        <h1 className="text-2xl font-semibold">Nota</h1>
        {note.data && (
          <p className="mt-1 text-sm text-muted-foreground">
            Última modificación: {noteDate(note.data.updatedAt)}
          </p>
        )}
      </div>

      {note.isPending && <div className="h-80 animate-pulse rounded-2xl bg-muted" aria-busy="true" />}
      {note.error && (
        <div className="space-y-3">
          <p
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {apiErrorMessage(note.error, "No se pudo abrir la nota.")}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void note.refetch()}>
              Reintentar
            </Button>
            <Link href={NOTES_PATH} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Volver a las notas
            </Link>
          </div>
        </div>
      )}
      {note.data?.trashedAt && (
        <p role="status" className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
          Esta nota está en la papelera. Restaurala desde la lista para modificarla.
        </p>
      )}
      {original && !note.data?.trashedAt && (
        <NoteForm
          key={note.data?.updatedAt}
          initial={original}
          submitLabel="Guardar cambios"
          pending={save.isPending}
          error={save.error ?? trash.error}
          onSubmit={(form) => save.mutate(form)}
        >
          <Button
            type="button"
            variant="ghost"
            disabled={trash.isPending}
            onClick={() => trash.mutate()}
          >
            <Trash2 size={14} /> Enviar a la papelera
          </Button>
        </NoteForm>
      )}
    </div>
  );
}

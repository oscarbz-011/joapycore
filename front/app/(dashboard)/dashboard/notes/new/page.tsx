"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { NoteForm } from "@/components/notes/note-form";
import { useAuth } from "@/lib/auth-context";
import { notesApi, type NoteInput } from "@/lib/api/notes";
import { EMPTY_NOTE, NOTES_PATH } from "@/lib/notes";

export default function NewNotePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const create = useMutation({
    mutationFn: (form: NoteInput) => notesApi.create({ ...form, title: form.title.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["notes", jwtPayload?.tenantId, jwtPayload?.sub],
      });
      router.push(NOTES_PATH);
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={NOTES_PATH}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Notas
        </Link>
        <h1 className="text-2xl font-semibold">Nueva nota</h1>
      </div>
      <NoteForm
        initial={EMPTY_NOTE}
        submitLabel="Guardar nota"
        pending={create.isPending}
        error={create.error}
        onSubmit={(form) => create.mutate(form)}
      />
    </div>
  );
}

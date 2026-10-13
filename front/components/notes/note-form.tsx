"use client";

import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api/api-error";
import type { NoteInput } from "@/lib/api/notes";
import { NOTES_PATH, PRIORITIES } from "@/lib/notes";

export function NoteForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  children,
}: {
  initial: NoteInput;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (form: NoteInput) => void;
  /** Acciones extra junto a Guardar (enviar a la papelera, etc.). */
  children?: React.ReactNode;
}) {
  const [form, setForm] = useState<NoteInput>(initial);
  const set = <K extends keyof NoteInput>(key: K, value: NoteInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="space-y-5 rounded-2xl border border-border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (form.title.trim() && !pending) onSubmit(form);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="note-title">Título</Label>
        <Input
          id="note-title"
          value={form.title}
          maxLength={160}
          required
          placeholder="De qué se trata"
          onChange={(event) => set("title", event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note-body">Nota</Label>
        <Textarea
          id="note-body"
          value={form.body}
          maxLength={20000}
          rows={12}
          placeholder="Escribí lo que no querés olvidar"
          onChange={(event) => set("body", event.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Prioridad</legend>
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((priority) => (
              <button
                key={priority.id}
                type="button"
                aria-pressed={form.priority === priority.id}
                onClick={() => set("priority", priority.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  form.priority === priority.id
                    ? "border-foreground/40 bg-muted font-medium"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: priority.color }}
                />
                {priority.label}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          aria-pressed={form.starred}
          onClick={() => set("starred", !form.starred)}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
            form.starred
              ? "border-foreground/40 bg-muted font-medium"
              : "border-border text-muted-foreground hover:bg-muted/50",
          )}
        >
          <Star size={14} fill={form.starred ? "var(--warn)" : "none"} stroke={form.starred ? "var(--warn)" : "currentColor"} />
          Destacada
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {apiErrorMessage(error, "No se pudo guardar la nota.")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!form.title.trim() || pending}>
            {pending ? "Guardando..." : submitLabel}
          </Button>
          <Link href={NOTES_PATH} className={cn(buttonVariants({ variant: "outline" }))}>
            Cancelar
          </Link>
        </div>
        {children}
      </div>
    </form>
  );
}

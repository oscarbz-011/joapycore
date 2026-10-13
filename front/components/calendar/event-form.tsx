"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api/api-error";
import type { CalendarEventInput } from "@/lib/api/calendar";
import { CALENDAR_PATH, eventInput, formError, type EventForm as Form } from "@/lib/calendar";

export function EventForm({
  initial,
  submitLabel,
  pending,
  error,
  backHref = CALENDAR_PATH,
  onSubmit,
  children,
}: {
  initial: Form;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  backHref?: string;
  onSubmit: (input: CalendarEventInput) => void;
  /** Acciones extra junto a Guardar (eliminar, etc.). */
  children?: React.ReactNode;
}) {
  const [form, setForm] = useState<Form>(initial);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const problem = formError(form);

  return (
    <form
      className="space-y-5 rounded-2xl border border-border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!problem && !pending) onSubmit(eventInput(form));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="event-title">Título</Label>
        <Input
          id="event-title"
          value={form.title}
          maxLength={160}
          placeholder="Reunión, visita, vencimiento…"
          onChange={(event) => set("title", event.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.allDay}
          onCheckedChange={(checked) => set("allDay", checked === true)}
        />
        Todo el día
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="event-start-day">Empieza</Label>
          <div className="flex gap-2">
            <DatePicker
              id="event-start-day"
              value={form.startDay}
              onChange={(day) => {
                // Mover el inicio arrastra el fin si quedaba antes.
                setForm((current) => ({
                  ...current,
                  startDay: day,
                  endDay: current.endDay < day ? day : current.endDay,
                }));
              }}
              className="flex-1"
            />
            {!form.allDay && (
              <Input
                type="time"
                aria-label="Hora de inicio"
                value={form.startTime}
                onChange={(event) => set("startTime", event.target.value)}
                className="w-28"
              />
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-end-day">Termina</Label>
          <div className="flex gap-2">
            <DatePicker
              id="event-end-day"
              value={form.endDay}
              onChange={(day) => set("endDay", day)}
              className="flex-1"
            />
            {!form.allDay && (
              <Input
                type="time"
                aria-label="Hora de fin"
                value={form.endTime}
                onChange={(event) => set("endTime", event.target.value)}
                className="w-28"
              />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="event-location">Lugar (opcional)</Label>
        <Input
          id="event-location"
          value={form.location}
          maxLength={200}
          onChange={(event) => set("location", event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="event-description">Detalle (opcional)</Label>
        <Textarea
          id="event-description"
          value={form.description}
          maxLength={5000}
          rows={5}
          onChange={(event) => set("description", event.target.value)}
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={form.companyWide}
          onCheckedChange={(checked) => set("companyWide", checked === true)}
        />
        <span>
          Visible para toda la empresa
          <span className="block text-xs text-muted-foreground">
            Si no, solo lo ves vos. Los demás pueden verlo pero no modificarlo.
          </span>
        </span>
      </label>

      {touched && problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {apiErrorMessage(error, "No se pudo guardar el evento.")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : submitLabel}
          </Button>
          <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
            Cancelar
          </Link>
        </div>
        {children}
      </div>
    </form>
  );
}

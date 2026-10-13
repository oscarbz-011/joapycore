"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EventForm } from "@/components/calendar/event-form";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { apiErrorMessage } from "@/lib/api/api-error";
import { calendarApi, type CalendarEvent, type CalendarEventInput } from "@/lib/api/calendar";
import { CALENDAR_PATH, dayTitle, formOf, googleCalendarUrl, instantParts } from "@/lib/calendar";

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const key = ["calendar", jwtPayload?.tenantId, jwtPayload?.sub] as const;
  const [confirming, setConfirming] = useState(false);
  const event = useQuery({
    queryKey: [...key, "event", id],
    queryFn: () => calendarApi.event(id),
  });
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    router.push(CALENDAR_PATH);
  };
  const save = useMutation({
    mutationFn: (input: CalendarEventInput) => calendarApi.update(id, input),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => calendarApi.remove(id),
    onSuccess: () => {
      // Ya no existe: que no se vuelva a pedir.
      queryClient.removeQueries({ queryKey: [...key, "event", id] });
      done();
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={CALENDAR_PATH}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> Calendario
          </Link>
          <h1 className="text-2xl font-semibold">Evento</h1>
        </div>
        {event.data && (
          <a
            href={googleCalendarUrl(event.data)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ExternalLink size={14} /> Agregar a Google Calendar
          </a>
        )}
      </div>

      {event.isPending && <div className="h-80 animate-pulse rounded-2xl bg-muted" aria-busy="true" />}
      {event.error && (
        <div className="space-y-3">
          <p
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {apiErrorMessage(event.error, "No se pudo abrir el evento.")}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void event.refetch()}>
              Reintentar
            </Button>
            <Link href={CALENDAR_PATH} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Volver al calendario
            </Link>
          </div>
        </div>
      )}

      {event.data && !event.data.mine && <ReadOnlyEvent event={event.data} />}
      {event.data?.mine && (
        <EventForm
          key={event.data.updatedAt}
          initial={formOf(event.data)}
          submitLabel="Guardar cambios"
          pending={save.isPending}
          error={save.error ?? remove.error}
          onSubmit={(input) => save.mutate(input)}
        >
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">¿Eliminar el evento?</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Sí, eliminar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                No
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
              <Trash2 size={14} /> Eliminar
            </Button>
          )}
        </EventForm>
      )}
    </div>
  );
}

// Un evento de la empresa creado por otra persona: se ve, no se modifica.
function ReadOnlyEvent({ event }: { event: CalendarEvent }) {
  const start = event.allDay ? { day: event.startsAt.slice(0, 10), time: null } : instantParts(event.startsAt);
  const end = event.allDay ? { day: event.endsAt.slice(0, 10), time: null } : instantParts(event.endsAt);
  const sameDay = start.day === end.day;
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="break-words text-lg font-semibold">{event.title}</h2>
      <p className="text-sm first-letter:uppercase">
        {dayTitle(start.day)}
        {start.time ? `, ${start.time}` : ""}
        {sameDay ? (end.time ? ` a ${end.time}` : "") : ` hasta ${dayTitle(end.day)}${end.time ? `, ${end.time}` : ""}`}
        {event.allDay ? " · todo el día" : ""}
      </p>
      {event.location && <p className="text-sm text-muted-foreground">Lugar: {event.location}</p>}
      {event.description && (
        <p className="whitespace-pre-wrap break-words text-sm">{event.description}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Evento de la empresa. Solo quien lo creó puede modificarlo.
      </p>
    </section>
  );
}

"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { EventForm } from "@/components/calendar/event-form";
import { useAuth } from "@/lib/auth-context";
import { calendarApi } from "@/lib/api/calendar";
import { CALENDAR_PATH, emptyForm, instantParts } from "@/lib/calendar";
import { localISODate, parseISODate } from "@/lib/date";

export default function NewEventPage() {
  return (
    <Suspense fallback={null}>
      <NewEvent />
    </Suspense>
  );
}

function NewEvent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const requested = useSearchParams().get("date");
  const day = requested && parseISODate(requested) ? requested : localISODate(new Date());
  const back = `${CALENDAR_PATH}?m=${day.slice(0, 7)}&d=${day}`;
  const create = useMutation({
    mutationFn: calendarApi.create,
    onSuccess: (event) => {
      void queryClient.invalidateQueries({
        queryKey: ["calendar", jwtPayload?.tenantId, jwtPayload?.sub],
      });
      const eventDay = event.allDay ? event.startsAt.slice(0, 10) : instantParts(event.startsAt).day;
      router.push(`${CALENDAR_PATH}?m=${eventDay.slice(0, 7)}&d=${eventDay}`);
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={back}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Calendario
        </Link>
        <h1 className="text-2xl font-semibold">Nuevo evento</h1>
      </div>
      <EventForm
        initial={emptyForm(day)}
        submitLabel="Guardar evento"
        pending={create.isPending}
        error={create.error}
        backHref={back}
        onSubmit={(input) => create.mutate(input)}
      />
    </div>
  );
}

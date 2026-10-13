"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { apiBase } from "@/lib/api/api-base";
import { apiErrorMessage } from "@/lib/api/api-error";
import { calendarApi } from "@/lib/api/calendar";
import { CALENDAR_PATH, feedUrl } from "@/lib/calendar";

const STEPS: { name: string; steps: string }[] = [
  {
    name: "Google Calendar",
    steps: "En la computadora: Otros calendarios → + → Desde URL. Pegá la dirección y elegí Añadir calendario.",
  },
  {
    name: "Outlook",
    steps: "Agregar calendario → Suscribirse desde la web. Pegá la dirección y poné un nombre.",
  },
  {
    name: "Apple (iPhone o Mac)",
    steps: "Calendario → Archivo → Nueva suscripción a calendario. En el iPhone: Ajustes → Calendario → Cuentas → Añadir cuenta → Otra.",
  },
];

export default function CalendarSyncPage() {
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const key = ["calendar", jwtPayload?.tenantId, jwtPayload?.sub, "feed"] as const;
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const feed = useQuery({ queryKey: key, queryFn: calendarApi.feed });
  const reset = useMutation({
    mutationFn: calendarApi.resetFeed,
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      setConfirming(false);
      setCopied(false);
    },
  });
  const url = feed.data ? feedUrl(apiBase(process.env.NEXT_PUBLIC_API_URL), feed.data.token) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={CALENDAR_PATH}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Calendario
        </Link>
        <h1 className="text-2xl font-semibold">Conectar con otro calendario</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Tus eventos y los de la empresa aparecen en Google Calendar, Outlook o el calendario
          del teléfono. Es de solo lectura: lo que cargues allá no vuelve a JoapyCore.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="calendar-feed">Tu dirección de calendario</Label>
          {feed.isPending && <div className="h-9 animate-pulse rounded-3xl bg-muted" aria-busy="true" />}
          {feed.error && (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                {apiErrorMessage(feed.error, "No se pudo obtener la dirección.")}
              </p>
              <Button variant="outline" size="sm" onClick={() => void feed.refetch()}>
                Reintentar
              </Button>
            </div>
          )}
          {feed.data && (
            <div className="flex flex-wrap gap-2">
              <Input
                id="calendar-feed"
                readOnly
                value={url}
                className="min-w-0 flex-1 font-mono text-xs"
                onFocus={(event) => event.target.select()}
              />
              <Button variant="outline" onClick={() => void copy()}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copiada" : "Copiar"}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Es personal y funciona como una contraseña: quien la tenga ve tus eventos. El otro
            calendario la consulta cada varias horas, así que un cambio puede tardar en verse.
          </p>
        </div>

        <ul className="space-y-3 border-t border-border pt-4">
          {STEPS.map((item) => (
            <li key={item.name} className="text-sm">
              <span className="font-medium">{item.name}.</span>{" "}
              <span className="text-muted-foreground">{item.steps}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Si la dirección se compartió por error</h2>
        <p className="text-sm text-muted-foreground">
          Generá una nueva. La anterior deja de funcionar y hay que volver a conectar los
          calendarios que la usaban.
        </p>
        {reset.error ? (
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(reset.error, "No se pudo generar la dirección.")}
          </p>
        ) : null}
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">¿Generar una dirección nueva?</span>
            <Button
              variant="destructive"
              size="sm"
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
            >
              Sí, generar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              No
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" disabled={!feed.data} onClick={() => setConfirming(true)}>
            Generar una dirección nueva
          </Button>
        )}
      </section>
    </div>
  );
}

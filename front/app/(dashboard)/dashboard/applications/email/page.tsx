"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Send, Settings, X } from "lucide-react";
import { applicationsApi } from "@/lib/api/applications";
import { apiErrorMessage } from "@/lib/api/api-error";
import { usePermission } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function ComposeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      applicationsApi.sendEmail({
        to: to.trim(),
        subject: subject.trim(),
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["application-email-messages"],
      });
      setTo("");
      setSubject("");
      setBody("");
      onOpenChange(false);
    },
    onError: (err: Error) =>
      setError(apiErrorMessage(err, "No se pudo enviar el correo")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="p-0 sm:max-w-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>Nuevo correo</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
          >
            <X size={18} />
          </Button>
        </div>
        <form
          className="space-y-4 px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Para</Label>
            <Input
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              required
              placeholder="destinatario@empresa.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Asunto</Label>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mensaje</Label>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              rows={10}
            />
          </div>
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              <Send size={15} />
              {mutation.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ApplicationEmailPage() {
  const [composeOpen, setComposeOpen] = useState(false);
  const canSend = usePermission("applications:email:send");
  const canReadIntegrations = usePermission("integrations:read");
  const { data: emailStatus } = useQuery({
    queryKey: ["application-email-status"],
    queryFn: applicationsApi.getEmailStatus,
  });
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["application-email-messages"],
    queryFn: applicationsApi.listEmailMessages,
  });
  const ready = emailStatus?.enabled ?? false;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Correo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enviá correos desde la cuenta configurada para tu empresa.
          </p>
        </div>
        {canSend && (
          <Button onClick={() => setComposeOpen(true)} disabled={!ready}>
            <Plus size={16} />
            Nuevo correo
          </Button>
        )}
      </div>

      {!ready && (
        <Card className="mb-5 flex items-center justify-between gap-4 border-warn/30 bg-warn-subtle p-4">
          <div className="flex items-center gap-3">
            <Mail size={20} className="text-warn" />
            <div>
              <p className="text-sm font-medium">
                Configurá la salida de correo
              </p>
              <p className="text-xs text-muted-foreground">
                La integración SMTP está desactivada o incompleta.
              </p>
            </div>
          </div>
          {canReadIntegrations && (
            <Link href="/dashboard/settings?tab=integrations">
              <Button variant="outline" size="sm">
                <Settings size={14} />
                Ir a configuración
              </Button>
            </Link>
          )}
        </Card>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Cargando correos...
        </div>
      ) : messages.length === 0 ? (
        <Card className="py-16 text-center">
          <Mail className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Todavía no se enviaron correos desde el ERP.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-border">
            {messages.map((message) => (
              <div key={message.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {message.subject}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Para: {message.recipient}
                    </p>
                  </div>
                  <Badge
                    variant={
                      message.status === "FAILED" ? "destructive" : "outline"
                    }
                  >
                    {message.status === "SENT"
                      ? "Enviado"
                      : message.status === "FAILED"
                        ? "Fallido"
                        : "Enviando"}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {message.bodyText}
                </p>
                <p className="mt-2 text-xs text-muted-foreground/60">
                  {new Date(message.sentAt ?? message.createdAt).toLocaleString(
                    "es-PY",
                  )}{" "}
                  · {message.sentBy.firstName} {message.sentBy.lastName}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  );
}

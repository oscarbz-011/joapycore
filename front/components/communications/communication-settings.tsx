"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { usePermission } from "@/lib/permissions";
import {
  communicationsApi,
  type CommunicationSettings,
  type CommunicationIdentity,
  type IdentityInput,
  type TemplateInput,
} from "@/lib/api/communications";
import { CommunicationDate, CommunicationError } from "./shared";

export function CommunicationConfiguration({
  settings,
}: {
  settings: CommunicationSettings;
}) {
  const { jwtPayload } = useAuth();
  const canReadIntegrations = usePermission("integrations:read");
  const canManageIntegrations = usePermission("integrations:manage");
  const tenantId = jwtPayload?.tenantId;
  const userId = jwtPayload?.sub;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CommunicationSettings | null>(null);
  const form = draft ?? settings;
  const identities = useQuery({
    queryKey: ["communications", tenantId, userId, "identities"],
    queryFn: communicationsApi.identities,
  });
  const templates = useQuery({
    queryKey: ["communications", tenantId, userId, "templates"],
    queryFn: communicationsApi.templates,
  });
  const update = useMutation({
    mutationFn: () => communicationsApi.updateSettings(form),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({
        queryKey: ["communications", tenantId, userId, "settings"],
      });
    },
  });
  const [editing, setEditing] = useState<CommunicationIdentity | "new" | null>(
    null,
  );
  const [template, setTemplate] = useState<TemplateInput>({
    subject: "Factura {{invoice.number}} · {{tenant.name}}",
    bodyText:
      "Hola {{customer.name}},\n\nAdjuntamos la factura {{invoice.number}} por {{invoice.total}}.\n\nSaludos,\n{{tenant.name}}",
  });
  const createTemplate = useMutation({
    mutationFn: () => communicationsApi.createTemplate(template),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["communications", tenantId, userId, "templates"],
      });
    },
  });
  const preview = useMutation({
    mutationFn: () => communicationsApi.previewTemplate(template),
  });
  return (
    <div className="max-w-4xl space-y-6">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Activación por empresa</h2>
        <p className="text-sm text-muted-foreground">
          Configurá el remitente y la plantilla antes de activar los envíos
          automáticos.
        </p>
        {(
          [
            ["enabled", "Centro de comunicaciones"],
            ["emailEnabled", "Envío de correos"],
            [
              "invoiceEmailEnabled",
              "Enviar automáticamente las facturas al emitirlas",
            ],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={form[key]}
              onChange={(e) => {
                setDraft({ ...form, [key]: e.target.checked });
                update.reset();
              }}
            />
            {label}
          </label>
        ))}
        {update.error && <CommunicationError error={update.error} />}
        <Button
          disabled={update.isPending || !draft}
          onClick={() => update.mutate()}
        >
          {update.isPending ? "Guardando..." : "Guardar activación"}
        </Button>
        {update.isSuccess && (
          <p role="status" className="text-xs text-muted-foreground">
            Configuración guardada.
          </p>
        )}
      </section>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Identidades remitentes</h2>
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            Nueva identidad
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          La dirección debe coincidir con el remitente SMTP configurado.
          Reply-To permite recibir respuestas en otra dirección.
        </p>
        {canReadIntegrations || canManageIntegrations ? (
          <Link
            href="/dashboard/settings?tab=integrations"
            className="inline-block text-sm underline"
          >
            Configurar conexión SMTP en Integraciones
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            Un administrador con acceso a integraciones debe configurar la
            conexión SMTP.
          </p>
        )}
        {identities.isPending && (
          <p className="text-sm text-muted-foreground">
            Cargando identidades...
          </p>
        )}
        {identities.error && (
          <div className="space-y-3">
            <CommunicationError error={identities.error} />
            <Button variant="outline" size="sm" onClick={() => void identities.refetch()}>
              Reintentar identidades
            </Button>
          </div>
        )}
        {identities.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hay identidades configuradas.
          </p>
        )}
        {identities.data?.map((identity) => (
          <div
            key={identity.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
          >
            <div>
              <p className="text-sm font-medium">
                {identity.fromName || identity.name || identity.fromEmail}
              </p>
              <p className="text-xs text-muted-foreground">
                {identity.fromEmail} ·{" "}
                {identity.type === "SYSTEM" ? "Sistema" : "Compartida"}
                {identity.isDefault ? " · Predeterminada" : ""}
                {identity.outboundEnabled ? "" : " · Desactivada"}
              </p>
              {identity.replyTo && (
                <p className="text-xs text-muted-foreground">
                  Respuestas: {identity.replyTo}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(identity)}
            >
              Editar
            </Button>
          </div>
        ))}
        {editing && (
          <IdentityEditor
            key={editing === "new" ? "new" : editing.id}
            identity={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void queryClient.invalidateQueries({
                queryKey: ["communications", tenantId, userId, "identities"],
              });
            }}
          />
        )}
      </section>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Plantilla de factura</h2>
        <p className="text-sm text-muted-foreground">
          Cada publicación crea una versión nueva. Los próximos envíos usan la
          última versión; los mensajes ya registrados conservan su contenido.
        </p>
        <div className="space-y-2">
          <label htmlFor="template-subject" className="text-sm font-medium">
            Asunto
          </label>
          <Input
            id="template-subject"
            value={template.subject}
            maxLength={200}
            onChange={(e) => {
              setTemplate({ ...template, subject: e.target.value });
              preview.reset();
              createTemplate.reset();
            }}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="template-body" className="text-sm font-medium">
            Mensaje
          </label>
          <Textarea
            id="template-body"
            value={template.bodyText}
            maxLength={20000}
            rows={7}
            onChange={(e) => {
              setTemplate({ ...template, bodyText: e.target.value });
              preview.reset();
              createTemplate.reset();
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Variables:{" "}
          {
            "{{invoice.number}}, {{invoice.total}}, {{invoice.issuedAt}}, {{invoice.dueDate}}, {{customer.name}}, {{tenant.name}}"
          }
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={
              !template.subject.trim() ||
              !template.bodyText.trim() ||
              preview.isPending
            }
            onClick={() => preview.mutate()}
          >
            Vista previa
          </Button>
          <Button
            disabled={
              !template.subject.trim() ||
              !template.bodyText.trim() ||
              createTemplate.isPending
            }
            onClick={() => createTemplate.mutate()}
          >
            {createTemplate.isPending
              ? "Publicando..."
              : "Publicar nueva versión"}
          </Button>
        </div>
        {preview.error && <CommunicationError error={preview.error} />}
        {createTemplate.error && (
          <CommunicationError error={createTemplate.error} />
        )}
        {createTemplate.isSuccess && (
          <p role="status" className="text-sm text-muted-foreground">
            Versión {createTemplate.data.version} publicada.
          </p>
        )}
        {preview.data && (
          <div className="space-y-2 rounded-xl bg-muted/50 p-4">
            <p className="text-xs text-muted-foreground">
              Vista previa con datos de ejemplo
            </p>
            <p className="font-medium">{preview.data.subject}</p>
            <p className="whitespace-pre-wrap break-words text-sm">
              {preview.data.bodyText}
            </p>
          </div>
        )}
        {templates.error && (
          <div className="space-y-3">
            <CommunicationError error={templates.error} />
            <Button variant="outline" size="sm" onClick={() => void templates.refetch()}>
              Reintentar versiones
            </Button>
          </div>
        )}
        {templates.isPending && (
          <p className="text-sm text-muted-foreground">Cargando versiones...</p>
        )}
        {templates.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Publicá la primera versión para habilitar el envío de facturas.
          </p>
        )}
        <div className="space-y-2">
          {templates.data?.map((version) => (
            <div
              key={version.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"
            >
              <div>
                <p className="text-sm">
                  Versión {version.version} · {version.subject}
                </p>
                <p className="text-xs text-muted-foreground">
                  <CommunicationDate value={version.createdAt} />
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTemplate({
                    subject: version.subject,
                    bodyText: version.bodyText,
                  });
                  preview.reset();
                  createTemplate.reset();
                }}
              >
                Usar como base
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function IdentityEditor({
  identity,
  onClose,
  onSaved,
}: {
  identity: CommunicationIdentity | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<IdentityInput>(
    identity
      ? {
          type: identity.type,
          fromEmail: identity.fromEmail,
          fromName: identity.fromName,
          replyTo: identity.replyTo,
          outboundEnabled: identity.outboundEnabled,
          isDefault: identity.isDefault,
        }
      : {
          type: "SYSTEM",
          fromEmail: "",
          fromName: "",
          replyTo: "",
          outboundEnabled: true,
          isDefault: true,
        },
  );
  const save = useMutation({
    mutationFn: () => {
      const dto = {
        ...form,
        fromEmail: form.fromEmail.trim(),
        fromName: form.fromName?.trim() || undefined,
        replyTo: form.replyTo?.trim() || null,
      };
      return identity
        ? communicationsApi.updateIdentity(identity.id, dto)
        : communicationsApi.createIdentity(dto);
    },
    onSuccess: onSaved,
  });
  return (
    <form
      className="space-y-3 rounded-xl bg-muted/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h3 className="text-sm font-medium">
        {identity ? "Editar identidad" : "Nueva identidad"}
      </h3>
      <label className="block space-y-1 text-sm">
        <span>Tipo</span>
        <select
          className="block w-full rounded-xl border border-border bg-background p-2"
          value={form.type}
          onChange={(e) =>
            setForm({ ...form, type: e.target.value as IdentityInput["type"] })
          }
        >
          <option value="SYSTEM">Sistema / notificaciones</option>
          <option value="SHARED">Compartida</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span>Correo remitente</span>
        <Input
          type="email"
          required
          value={form.fromEmail}
          onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Nombre visible</span>
        <Input
          value={form.fromName ?? ""}
          maxLength={120}
          onChange={(e) => setForm({ ...form, fromName: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Responder a (opcional)</span>
        <Input
          type="email"
          value={form.replyTo ?? ""}
          onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
          placeholder="ventas@empresa.com"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.outboundEnabled}
          onChange={(e) =>
            setForm({
              ...form,
              outboundEnabled: e.target.checked,
              isDefault: e.target.checked ? form.isDefault : false,
            })
          }
        />
        Permitir envíos
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) =>
            setForm({
              ...form,
              isDefault: e.target.checked,
              outboundEnabled: e.target.checked ? true : form.outboundEnabled,
            })
          }
        />
        Remitente predeterminado
      </label>
      {save.error && <CommunicationError error={save.error} />}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? "Guardando..." : "Guardar identidad"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

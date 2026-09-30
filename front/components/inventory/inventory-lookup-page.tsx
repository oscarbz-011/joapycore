"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { RequirePermission } from "@/components/require-permission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/api/api-error";

interface InventoryLookupItem {
  id: string;
  name: string;
  isActive: boolean;
}

interface InventoryLookupPageProps {
  title: string;
  description: string;
  itemName: string;
  inputPlaceholder: string;
  emptyMessage: string;
  createErrorMessage: string;
  managePermission: string;
  queryKey: string[];
  list: () => Promise<InventoryLookupItem[]>;
  create: (name: string) => Promise<unknown>;
  updateActive: (item: InventoryLookupItem) => Promise<unknown>;
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        isActive
          ? "border-accent-on/20 bg-accent-subtle text-accent-on"
          : "border-border bg-muted/30 text-muted-foreground"
      }
    >
      {isActive ? "Activa" : "Inactiva"}
    </Badge>
  );
}

export function InventoryLookupPage({
  title,
  description,
  itemName,
  inputPlaceholder,
  emptyMessage,
  createErrorMessage,
  managePermission,
  queryKey,
  list,
  create,
  updateActive,
}: InventoryLookupPageProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const listQuery = useQuery({ queryKey, queryFn: list });
  const items = listQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => create(name.trim()),
    onMutate: () => setError(""),
    onSuccess: () => {
      setName("");
      setError("");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (cause: Error) => {
      setError(apiErrorMessage(cause, createErrorMessage));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: updateActive,
    onMutate: () => setError(""),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (cause) => {
      setError(
        apiErrorMessage(cause, `No se pudo actualizar la ${itemName}.`),
      );
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="max-w-2xl rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">{title}</h2>
        <RequirePermission permission={managePermission}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              createMutation.mutate();
            }}
            className="mb-4 flex gap-2"
          >
            <Input
              aria-label={`Nombre de la ${itemName}`}
              className="flex-1"
              placeholder={inputPlaceholder}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              <Plus size={14} />
              Agregar
            </Button>
          </form>
        </RequirePermission>
        {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

        {listQuery.isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Cargando {title.toLocaleLowerCase("es")}...
          </p>
        ) : listQuery.isError ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm text-destructive">
              {apiErrorMessage(
                listQuery.error,
                `No se pudieron cargar las ${title.toLocaleLowerCase("es")}.`,
              )}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
            >
              Reintentar
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground/60">
            {emptyMessage}
          </p>
        ) : (
          <ul className="space-y-1.5" aria-label={title}>
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
              >
                <span className="text-sm text-foreground">{item.name}</span>
                <div className="flex items-center gap-2">
                  <ActiveBadge isActive={item.isActive} />
                  <RequirePermission permission={managePermission}>
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate(item)}
                      disabled={toggleMutation.isPending}
                      className="text-xs text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
                      aria-label={`${item.isActive ? "Desactivar" : "Activar"} ${itemName} ${item.name}`}
                    >
                      {item.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </RequirePermission>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

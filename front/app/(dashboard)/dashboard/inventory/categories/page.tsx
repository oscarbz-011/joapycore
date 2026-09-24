"use client";

import { RequirePermission } from "@/components/require-permission";

import { apiErrorMessage } from "@/lib/api/api-error";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { inventoryApi, type Category } from "../../../../../lib/api/inventory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Active badge ───────────────────────────────────────────────────────────────

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge
      variant="outline"
      className="bg-accent-subtle text-accent-on border-accent-on/20"
    >
      Activa
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="bg-muted/30 text-muted-foreground border-border"
    >
      Inactiva
    </Badge>
  );
}

// ── Categories panel ───────────────────────────────────────────────────────────

function CategoriesPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["inventory-categories"],
    queryFn: inventoryApi.listCategories,
  });

  const createMutation = useMutation({
    mutationFn: () => inventoryApi.createCategory(name.trim()),
    onSuccess: () => {
      setName("");
      setError("");
      void queryClient.invalidateQueries({
        queryKey: ["inventory-categories"],
      });
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, "Error al crear categoría"));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (cat: Category) =>
      inventoryApi.updateCategory(cat.id, { isActive: !cat.isActive }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["inventory-categories"] }),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Categorías</h2>

      <RequirePermission permission="inventory:categories:manage">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createMutation.mutate();
          }}
          className="mb-4 flex gap-2"
        >
          <Input
            className="flex-1"
            placeholder="Nombre de la categoría..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button type="submit" size="sm" disabled={createMutation.isPending}>
            <Plus size={14} />
            Agregar
          </Button>
        </form>
      </RequirePermission>
      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {categories.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground/60">
          No hay categorías registradas.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {categories.map((cat: Category) => (
            <li
              key={cat.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="text-sm text-foreground">{cat.name}</span>
              <div className="flex items-center gap-2">
                <ActiveBadge isActive={cat.isActive} />
                <RequirePermission permission="inventory:categories:manage">
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate(cat)}
                    disabled={toggleMutation.isPending}
                    className="text-xs text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
                  >
                    {cat.isActive ? "Desactivar" : "Activar"}
                  </button>
                </RequirePermission>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Categorías</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestión de categorías de productos
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <CategoriesPanel />
      </div>
    </div>
  );
}

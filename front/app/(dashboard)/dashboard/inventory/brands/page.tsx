"use client";

import { RequirePermission } from "@/components/require-permission";

import { apiErrorMessage } from "@/lib/api/api-error";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { inventoryApi, type Brand } from "../../../../../lib/api/inventory";
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

// ── Brands panel ───────────────────────────────────────────────────────────────

function BrandsPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const { data: brands = [] } = useQuery({
    queryKey: ["inventory-brands"],
    queryFn: inventoryApi.listBrands,
  });

  const createMutation = useMutation({
    mutationFn: () => inventoryApi.createBrand(name.trim()),
    onSuccess: () => {
      setName("");
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["inventory-brands"] });
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, "Error al crear marca"));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (brand: Brand) =>
      inventoryApi.updateBrand(brand.id, { isActive: !brand.isActive }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["inventory-brands"] }),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Marcas</h2>

      <RequirePermission permission="inventory:brands:manage">
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
            placeholder="Nombre de la marca..."
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

      {brands.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground/60">
          No hay marcas registradas.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {brands.map((brand: Brand) => (
            <li
              key={brand.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="text-sm text-foreground">{brand.name}</span>
              <div className="flex items-center gap-2">
                <ActiveBadge isActive={brand.isActive} />
                <RequirePermission permission="inventory:brands:manage">
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate(brand)}
                    disabled={toggleMutation.isPending}
                    className="text-xs text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
                  >
                    {brand.isActive ? "Desactivar" : "Activar"}
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

export default function BrandsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Marcas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestión de marcas de productos
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <BrandsPanel />
      </div>
    </div>
  );
}

"use client";

import { InventoryLookupPage } from "@/components/inventory/inventory-lookup-page";
import { inventoryApi } from "@/lib/api/inventory";

const queryKey = ["inventory-categories"];

export default function CategoriesPage() {
  return (
    <InventoryLookupPage
      title="Categorías"
      description="Gestión de categorías de productos"
      itemName="categoría"
      inputPlaceholder="Nombre de la categoría..."
      emptyMessage="No hay categorías registradas."
      createErrorMessage="Error al crear categoría"
      managePermission="inventory:categories:manage"
      queryKey={queryKey}
      list={inventoryApi.listCategories}
      create={inventoryApi.createCategory}
      updateActive={(category) =>
        inventoryApi.updateCategory(category.id, {
          isActive: !category.isActive,
        })
      }
    />
  );
}

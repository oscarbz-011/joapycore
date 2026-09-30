"use client";

import { InventoryLookupPage } from "@/components/inventory/inventory-lookup-page";
import { inventoryApi } from "@/lib/api/inventory";

const queryKey = ["inventory-brands"];

export default function BrandsPage() {
  return (
    <InventoryLookupPage
      title="Marcas"
      description="Gestión de marcas de productos"
      itemName="marca"
      inputPlaceholder="Nombre de la marca..."
      emptyMessage="No hay marcas registradas."
      createErrorMessage="Error al crear marca"
      managePermission="inventory:brands:manage"
      queryKey={queryKey}
      list={inventoryApi.listBrands}
      create={inventoryApi.createBrand}
      updateActive={(brand) =>
        inventoryApi.updateBrand(brand.id, { isActive: !brand.isActive })
      }
    />
  );
}

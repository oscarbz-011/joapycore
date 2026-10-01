export interface InventoryNavItem {
  label: string;
  href: string;
  permission: string;
}

export const INVENTORY_NAV_ITEMS = [
  {
    label: 'Productos',
    href: '/dashboard/inventory/products',
    permission: 'inventory:products:read',
  },
  {
    label: 'Categorías',
    href: '/dashboard/inventory/categories',
    permission: 'inventory:categories:read',
  },
  {
    label: 'Marcas',
    href: '/dashboard/inventory/brands',
    permission: 'inventory:brands:read',
  },
  {
    label: 'Movimientos',
    href: '/dashboard/inventory/movements',
    permission: 'inventory:movements:read',
  },
  {
    label: 'Lotes',
    href: '/dashboard/inventory/batches',
    permission: 'inventory:products:read',
  },
  {
    label: 'Carga inicial',
    href: '/dashboard/inventory/stock-entries/initial',
    permission: 'inventory:movements:create',
  },
  {
    label: 'Stock',
    href: '/dashboard/inventory/stock',
    permission: 'inventory:products:read',
  },
] as const satisfies readonly InventoryNavItem[];

export function isInventoryItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

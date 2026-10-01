import { describe, expect, it } from 'vitest';
import {
  INVENTORY_NAV_ITEMS,
  isInventoryItemActive,
} from './inventory-navigation';

describe('inventory navigation', () => {
  it('exposes only the seven approved sidebar destinations', () => {
    expect(
      INVENTORY_NAV_ITEMS.map(({ label, href, permission }) => ({
        label,
        href,
        permission,
      })),
    ).toEqual([
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
    ]);
    expect(INVENTORY_NAV_ITEMS.map((item) => String(item.label))).not.toContain(
      'Inventario',
    );
  });

  it('keeps nested product screens active under Productos', () => {
    expect(
      isInventoryItemActive(
        '/dashboard/inventory/products/product-1',
        '/dashboard/inventory/products',
      ),
    ).toBe(true);
    expect(
      isInventoryItemActive(
        '/dashboard/inventory/stock',
        '/dashboard/inventory/products',
      ),
    ).toBe(false);
  });
});

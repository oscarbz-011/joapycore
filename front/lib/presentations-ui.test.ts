import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PresentationsTab } from '@/app/(dashboard)/dashboard/inventory/products/[id]/presentations-tab';
import { PresentationsSetting } from '@/components/sales/presentations-setting';
import { SaleUnitPicker } from '@/components/sales/sale-unit-picker';
import { UnitSelect } from '@/components/inventory/unit-select';
import type { ProductPresentation } from './api/inventory';

const state = vi.hoisted(() => ({
  presentations: [] as ProductPresentation[],
  permissions: ['inventory:products:update', 'tenants:update'] as string[],
  queried: [] as { key: unknown[]; enabled: boolean }[],
}));

beforeEach(() => {
  state.presentations = [];
  state.permissions = ['inventory:products:update', 'tenants:update'];
  state.queried = [];
});

vi.mock('@/lib/permissions', () => ({
  usePermission: (permission: string) => state.permissions.includes(permission),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) => {
    state.queried.push({ key: queryKey, enabled: enabled !== false });
    const data =
      enabled === false
        ? undefined
        : queryKey[0] === 'product-presentations'
          ? state.presentations
          : undefined;
    return { data, isLoading: false, isError: false };
  },
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve(), setQueryData: () => undefined }),
  useMutation: () => ({ isPending: false, mutate: () => undefined }),
}));

const sheet: ProductPresentation = {
  id: 'pp1',
  productId: 'p1',
  name: 'Plancha entera',
  unitCode: 77,
  factor: 5.0325,
  length: 2.75,
  width: 1.83,
  height: null,
  salePrice: 480000,
  isActive: true,
};
const board = { id: 'p1', unitCode: 109, salePrice: 95000, isSerialized: false };

const picker = (props: Partial<Parameters<typeof SaleUnitPicker>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(SaleUnitPicker, {
      product: board,
      value: {},
      onChange: () => undefined,
      enabled: true,
      ...props,
    }),
  );

describe('SaleUnitPicker', () => {
  it('does not show nor ask anything when the company does not sell in presentations', () => {
    expect(picker({ enabled: false })).toBe('');
    expect(state.queried[0]?.enabled).toBe(false);
  });

  it('never offers another unit for a serialized product', () => {
    expect(picker({ product: { ...board, isSerialized: true } })).toBe('');
  });

  it('offers the product unit, its presentations and cuts for what is measured', () => {
    state.presentations = [sheet];
    const html = picker();
    expect(html).toContain('Se vende por');
    expect(html).toContain('Por M2');
  });

  it('shows what a chosen presentation holds', () => {
    state.presentations = [sheet];
    expect(picker({ value: { presentationId: 'pp1' } })).toContain('5,0325 M2 c/u');
  });

  it('asks for the dimensions of a cut and shows what each piece takes', () => {
    const html = picker({ value: { cut: { length: 1.2, width: 0.6 } } });
    expect(html).toContain('Largo (m)');
    expect(html).toContain('Ancho (m)');
    expect(html).not.toContain('Alto');
    expect(html).toContain('0,72 M2 por pieza');
    expect(picker({ value: { cut: { length: 1.2 } } })).toContain('Cargá las medidas de cada pieza');
  });

  it('hides itself for a counted product without presentations', () => {
    expect(picker({ product: { ...board, unitCode: 77 } })).toBe('');
  });
});

const tab = () =>
  renderToStaticMarkup(
    createElement(PresentationsTab, { productId: 'p1', unitCode: 109, basePrice: 95000 }),
  );

describe('PresentationsTab', () => {
  it('explains how to start when there are none', () => {
    const html = tab();
    expect(html).toContain('Se vende solo por M2');
    expect(html).toContain('Los cortes a medida se cargan al vender');
  });

  it('lists each datum in its own sortable column', () => {
    state.presentations = [sheet, { ...sheet, id: 'pp2', name: 'Media plancha', isActive: false }];
    const html = tab();
    expect(html).toContain('Plancha entera');
    expect(html).toContain('5,0325');
    expect(html).toContain('Desactivada');
    expect(html).toContain('Gs. 480.000');
    expect(html.match(/aria-sort=/g)).toHaveLength(6);
  });

  it('asks for the dimensions of a measured product, not a factor', () => {
    const html = tab();
    expect(html).toContain('Largo (m)');
    expect(html).toContain('Ancho (m)');
    expect(html).not.toContain('Cuántos M2 lleva');
  });

  it('only lets edit who can update products', () => {
    state.permissions = [];
    state.presentations = [sheet];
    const html = tab();
    expect(html).not.toContain('Agregar presentación');
    expect(html).not.toContain('Editar Plancha entera');
  });
});

describe('PresentationsSetting', () => {
  it('says the value comes from the industry until the company chooses', () => {
    const html = renderToStaticMarkup(
      createElement(PresentationsSetting, {
        config: { combosEnabled: false, presentationsEnabled: true, presentationsChosen: null },
      }),
    );
    expect(html).toContain('Activado según el rubro de la empresa');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toContain('Volver a lo que trae el rubro');
  });

  it('offers going back to the industry after the company chose', () => {
    const html = renderToStaticMarkup(
      createElement(PresentationsSetting, {
        config: { combosEnabled: false, presentationsEnabled: false, presentationsChosen: false },
      }),
    );
    expect(html).toContain('Desactivado por la empresa');
    expect(html).toContain('Volver a lo que trae el rubro');
  });
});

describe('UnitSelect', () => {
  it('asks which units the company already uses and shows the current one', () => {
    const html = renderToStaticMarkup(
      createElement(UnitSelect, { value: 869, onChange: () => undefined }),
    );
    expect(html).toContain('Hectáreas (ha)');
    expect(state.queried.map((q) => q.key[0])).toContain('units-in-use');
  });
});

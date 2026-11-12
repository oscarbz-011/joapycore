import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Slot } from './slot';
import { slotContributions } from './slots';
import type { FrontModuleManifest } from './types';

const state = vi.hoisted(() => ({ activeModules: [] as string[] }));

beforeEach(() => {
  state.activeModules = [];
});

vi.mock('@/lib/use-active-modules', () => ({
  useActiveModules: () => ({ activeModules: state.activeModules }),
}));

const Panel = ({ order }: { order: { id: string } }) => createElement('p', null, `panel ${order.id}`);
const Other = () => createElement('p', null, 'other');

describe('lugares para que un módulo aporte en otra pantalla', () => {
  const manifests: FrontModuleManifest[] = [
    { id: 'platform', slots: { 'sale-order.delivery': Other } },
    { id: 'logistics', module: 'logistics', slots: { 'sale-order.delivery': Panel } },
    { id: 'sales', module: 'sales' },
  ];

  it('only takes what active modules contribute, in registry order', () => {
    expect(
      slotContributions('sale-order.delivery', [], manifests).map((c) => c.id),
    ).toEqual(['platform']);
    expect(
      slotContributions('sale-order.delivery', ['logistics', 'sales'], manifests).map(
        (c) => c.id,
      ),
    ).toEqual(['platform', 'logistics']);
  });

  it('gives the order delivery to Logistics when it is active', () => {
    expect(slotContributions('sale-order.delivery', ['sales']).map((c) => c.id)).toEqual(
      [],
    );
    expect(
      slotContributions('sale-order.delivery', ['sales', 'logistics']).map((c) => c.id),
    ).toEqual(['logistics']);
  });

});

describe('<Slot>', () => {
  const render = () =>
    renderToStaticMarkup(
      createElement(Slot, {
        name: 'sale-order.delivery',
        props: { order: { id: 'o1', status: 'INVOICED' }, onDelivered: () => undefined },
        fallback: createElement('p', null, 'Marcar como entregado'),
      }),
    );

  it('shows what the screen does on its own when no active module contributes', () => {
    expect(render()).toContain('Marcar como entregado');
  });

  it('replaces it with what an active module contributes', () => {
    state.activeModules = ['logistics'];
    expect(render()).not.toContain('Marcar como entregado');
  });
});

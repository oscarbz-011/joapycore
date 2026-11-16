'use client';

import { Component, createElement, Suspense, type ReactNode } from 'react';
import { useActiveModules } from '@/lib/use-active-modules';
import type { SlotName, SlotProps } from './slot-types';
import { slotContributions } from './slots';

/**
 * Muestra lo que los módulos activos aportan a este lugar. `fallback` es lo que
 * la pantalla hace por su cuenta y aparece solo si ningún módulo activo aporta:
 * si uno aporta, el lugar es suyo aunque en ese momento no muestre nada.
 */
export function Slot<K extends SlotName>({
  name,
  props,
  fallback = null,
}: {
  name: K;
  props: SlotProps[K];
  fallback?: ReactNode;
}) {
  const { activeModules } = useActiveModules();
  const contributions = slotContributions(name, activeModules);
  if (contributions.length === 0) return <>{fallback}</>;

  return (
    <>
      {contributions.map(({ id, Component: Contribution }) => (
        <ContributionBoundary key={id}>
          <Suspense fallback={null}>{createElement(Contribution, props)}</Suspense>
        </ContributionBoundary>
      ))}
    </>
  );
}

// Si el aporte de un módulo falla (por ejemplo, no se pudo descargar), el
// resto de la pantalla sigue funcionando.
class ContributionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

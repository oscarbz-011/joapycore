'use client';

import { createElement, Suspense, type ReactNode } from 'react';
import { useActiveModules } from '@/lib/use-active-modules';
import type { SlotName, SlotProps } from './slot-types';
import { slotContributions } from './slots';

/**
 * Muestra lo que los módulos activos aportan a este lugar. Si ninguno aporta
 * nada, muestra `fallback`: lo que la pantalla hace por su cuenta.
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
      {contributions.map(({ id, Component }) => (
        <Suspense key={id} fallback={null}>
          {createElement(Component, props)}
        </Suspense>
      ))}
    </>
  );
}

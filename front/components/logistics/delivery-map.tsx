'use client';

import dynamic from 'next/dynamic';
import type { DeliveryMapInnerProps } from './delivery-map-inner';

// Leaflet necesita `window` — se carga solo del lado del cliente.
const DeliveryMapInner = dynamic(() => import('./delivery-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[220px] w-full items-center justify-center rounded-xl bg-muted/20 text-xs text-muted-foreground">
      Cargando mapa...
    </div>
  ),
});

export function DeliveryMap(props: DeliveryMapInnerProps) {
  return <DeliveryMapInner {...props} />;
}

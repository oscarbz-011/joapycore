import { Navigation } from 'lucide-react';
import { mapLinks, type Destination } from '@/lib/delivery-route';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Abre el destino en una app de mapas para seguir el recorrido. En el celular
 * el enlace abre la app instalada; en la computadora, la web.
 */
export function OpenInMaps({
  destination,
  size = 'sm',
  className,
}: {
  destination: Destination;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const links = mapLinks(destination);
  if (!links) return null;
  const link = cn(buttonVariants({ variant: 'outline', size }));
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <a href={links.google} target="_blank" rel="noopener noreferrer" className={link}>
        <Navigation aria-hidden />
        Google Maps
      </a>
      {links.waze && (
        <a href={links.waze} target="_blank" rel="noopener noreferrer" className={link}>
          <Navigation aria-hidden />
          Waze
        </a>
      )}
    </span>
  );
}

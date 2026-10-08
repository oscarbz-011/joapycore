import type { DeliveryRouteStatus } from '@/lib/api/delivery-routes';
import { ROUTE_STATUS_LABELS } from '@/lib/delivery-route';
import { Badge } from '@/components/ui/badge';

const VARIANT: Record<DeliveryRouteStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  OPEN: 'outline',
  IN_PROGRESS: 'default',
  COMPLETED: 'secondary',
  CANCELLED: 'destructive',
};

export function RouteStatusBadge({ status }: { status: DeliveryRouteStatus }) {
  return <Badge variant={VARIANT[status]}>{ROUTE_STATUS_LABELS[status]}</Badge>;
}

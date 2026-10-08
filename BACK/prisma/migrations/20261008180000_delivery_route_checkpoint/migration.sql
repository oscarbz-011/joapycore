-- El repartidor puede marcar un hito para todas las entregas de la ruta a
-- la vez; queda en el historial de la ruta.
ALTER TYPE "DeliveryRouteEventType" ADD VALUE 'CHECKPOINT';

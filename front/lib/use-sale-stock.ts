import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from './api/inventory';

/**
 * Stock por depósito de los productos vendibles: lo usan los formularios de
 * venta para indicar de qué depósito sale cada ítem (el backend lo exige).
 */
export function useSaleStock() {
  const { data } = useQuery({
    queryKey: ['inventory-stock', 'sale-lines'],
    queryFn: () => inventoryApi.getStock(),
  });
  return data;
}

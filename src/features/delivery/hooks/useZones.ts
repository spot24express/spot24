import { useQuery } from '@tanstack/react-query';
import { listActiveZones } from '../services/zones.service';

export function useZones() {
  return useQuery({
    queryKey: ['delivery', 'zones'],
    queryFn: listActiveZones,
    staleTime: 15 * 60 * 1000,
  });
}

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { getStats } from './api';

/** Leader dashboard read-model query (docs/06 §5). */
export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats.all,
    queryFn: getStats,
  });
}

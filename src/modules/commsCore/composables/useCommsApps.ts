import { useQuery } from '@tanstack/vue-query'

import { fetchCommsApps } from '../services/commsCoreService'

export function useCommsApps() {
  return useQuery({ queryKey: ['comms-core', 'apps'] as const, queryFn: fetchCommsApps })
}

import { useQuery } from '@tanstack/vue-query'
import { type MaybeRefOrGetter, toValue } from 'vue'

import { fetchNotifications } from '../services/commsCoreService'
import type { NotificationFilters } from '@/types/commsCore'

export function useNotifications(filters: MaybeRefOrGetter<NotificationFilters>) {
  return useQuery({
    queryKey: ['comms-core', 'notifications', filters] as const,
    queryFn: () => fetchNotifications(toValue(filters)),
  })
}

import { useMutation, useQueryClient } from '@tanstack/vue-query'

import type { CommsAppCreatePayload, CommsAppUpdatePayload } from '@/types/commsCore'

import { createCommsApp, regenerateCommsAppKey, updateCommsApp } from '../services/commsCoreService'

export function useCommsAppMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['comms-core', 'apps'] })

  const createMutation = useMutation({
    mutationFn: (payload: CommsAppCreatePayload) => createCommsApp(payload),
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: (params: { appId: string; payload: CommsAppUpdatePayload }) =>
      updateCommsApp(params.appId, params.payload),
    onSuccess: invalidate,
  })

  // No invalida la lista - regenerar no cambia ningun campo que la tabla
  // muestre (nunca se ve api_key ahi, solo api_key_masked).
  const regenerateKeyMutation = useMutation({
    mutationFn: (appId: string) => regenerateCommsAppKey(appId),
  })

  return { createMutation, updateMutation, regenerateKeyMutation }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { type Ref } from 'vue'

import type { BrevoCredentialsPayload } from '@/types/commsCore'

import { configureBrevo, fetchBrevoSecrets, fetchBrevoStatus } from '../services/commsCoreService'

export function useBrevoStatus(appId: Ref<string>) {
  return useQuery({
    queryKey: ['comms-core', 'apps', appId, 'brevo'] as const,
    queryFn: () => fetchBrevoStatus(appId.value),
  })
}

// useMutation (no useQuery) a proposito - mismo criterio que
// useMetaWhatsAppSecretsMutation/useWompiSecretsMutation.
export function useBrevoSecretsMutation() {
  return useMutation({
    mutationFn: (appId: string) => fetchBrevoSecrets(appId),
  })
}

export function useConfigureBrevoMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { appId: string; payload: BrevoCredentialsPayload }) =>
      configureBrevo(params.appId, params.payload),
    onSuccess: (_, params) =>
      queryClient.invalidateQueries({ queryKey: ['comms-core', 'apps', params.appId, 'brevo'] }),
  })
}

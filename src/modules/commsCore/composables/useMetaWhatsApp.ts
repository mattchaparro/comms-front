import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { type Ref } from 'vue'

import type { MetaWhatsAppCredentialsPayload } from '@/types/commsCore'

import { configureMetaWhatsApp, fetchMetaWhatsAppSecrets, fetchMetaWhatsAppStatus } from '../services/commsCoreService'

export function useMetaWhatsAppStatus(appId: Ref<string>) {
  return useQuery({
    queryKey: ['comms-core', 'apps', appId, 'meta-whatsapp'] as const,
    queryFn: () => fetchMetaWhatsAppStatus(appId.value),
  })
}

// useMutation (no useQuery) a proposito - "ver credenciales" es una accion
// puntual disparada por un boton, no algo que se deba refetchear solo
// (mismo criterio que useWompiSecretsMutation).
export function useMetaWhatsAppSecretsMutation() {
  return useMutation({
    mutationFn: (appId: string) => fetchMetaWhatsAppSecrets(appId),
  })
}

export function useConfigureMetaWhatsAppMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { appId: string; payload: MetaWhatsAppCredentialsPayload }) =>
      configureMetaWhatsApp(params.appId, params.payload),
    onSuccess: (_, params) =>
      queryClient.invalidateQueries({ queryKey: ['comms-core', 'apps', params.appId, 'meta-whatsapp'] }),
  })
}

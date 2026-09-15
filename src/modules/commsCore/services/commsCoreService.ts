import { httpClient } from '@/services/http/client'
import type {
  BrevoCredentialsPayload,
  BrevoSecrets,
  BrevoStatus,
  CommsApp,
  CommsAppCreated,
  CommsAppCreatePayload,
  CommsAppUpdatePayload,
  MetaWhatsAppCredentialsPayload,
  MetaWhatsAppSecrets,
  MetaWhatsAppStatus,
  NotificationFilters,
  NotificationList,
} from '@/types/commsCore'

export async function fetchNotifications(filters: NotificationFilters): Promise<NotificationList> {
  const { data } = await httpClient.get<NotificationList>('/v1/platform/notifications', {
    params: filters,
  })
  return data
}

export async function fetchCommsApps(): Promise<CommsApp[]> {
  // A diferencia del BFF de nexolu-admin (que envuelve en {apps}), comms-api
  // devuelve la lista directa.
  const { data } = await httpClient.get<CommsApp[]>('/v1/admin/apps')
  return data
}

export async function createCommsApp(payload: CommsAppCreatePayload): Promise<CommsAppCreated> {
  const { data } = await httpClient.post<CommsAppCreated>('/v1/admin/apps', payload)
  return data
}

export async function updateCommsApp(appId: string, payload: CommsAppUpdatePayload): Promise<CommsApp> {
  const { data } = await httpClient.patch<CommsApp>(`/v1/admin/apps/${appId}`, payload)
  return data
}

export async function regenerateCommsAppKey(appId: string): Promise<CommsAppCreated> {
  const { data } = await httpClient.post<CommsAppCreated>(
    `/v1/admin/apps/${appId}/regenerate-key`,
  )
  return data
}

export async function configureMetaWhatsApp(
  appId: string,
  payload: MetaWhatsAppCredentialsPayload,
): Promise<MetaWhatsAppStatus> {
  const { data } = await httpClient.post<MetaWhatsAppStatus>(
    `/v1/admin/apps/${appId}/providers/meta-whatsapp`,
    payload,
  )
  return data
}

export async function fetchMetaWhatsAppStatus(appId: string): Promise<MetaWhatsAppStatus> {
  const { data } = await httpClient.get<MetaWhatsAppStatus>(
    `/v1/admin/apps/${appId}/providers/meta-whatsapp`,
  )
  return data
}

export async function fetchMetaWhatsAppSecrets(appId: string): Promise<MetaWhatsAppSecrets> {
  const { data } = await httpClient.get<MetaWhatsAppSecrets>(
    `/v1/admin/apps/${appId}/providers/meta-whatsapp/secrets`,
  )
  return data
}

export async function configureBrevo(appId: string, payload: BrevoCredentialsPayload): Promise<BrevoStatus> {
  const { data } = await httpClient.post<BrevoStatus>(
    `/v1/admin/apps/${appId}/providers/brevo`,
    payload,
  )
  return data
}

export async function fetchBrevoStatus(appId: string): Promise<BrevoStatus> {
  const { data } = await httpClient.get<BrevoStatus>(`/v1/admin/apps/${appId}/providers/brevo`)
  return data
}

export async function fetchBrevoSecrets(appId: string): Promise<BrevoSecrets> {
  const { data } = await httpClient.get<BrevoSecrets>(
    `/v1/admin/apps/${appId}/providers/brevo/secrets`,
  )
  return data
}

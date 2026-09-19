import { httpClient } from '@/services/http/client'
import type { InboxAlertConfig, InboxAlertPayload, InboxAlertPreview } from '@/types/alerts'

// Refleja api/v1/admin_alerts.py en nexolu-comms-api (autorizado por scope).

export async function fetchAlertConfigs(): Promise<InboxAlertConfig[]> {
  const { data } = await httpClient.get<InboxAlertConfig[]>('/v1/admin/inbox-alerts')
  return data
}

export async function saveAlertConfig(payload: InboxAlertPayload): Promise<InboxAlertConfig> {
  const { data } = await httpClient.put<InboxAlertConfig>('/v1/admin/inbox-alerts', payload)
  return data
}

export async function previewAlert(
  appId: string,
  businessId = '',
): Promise<InboxAlertPreview> {
  const { data } = await httpClient.get<InboxAlertPreview>('/v1/admin/inbox-alerts/preview', {
    params: { app_id: appId, business_id: businessId || undefined },
  })
  return data
}

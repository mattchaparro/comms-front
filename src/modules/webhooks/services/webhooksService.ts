import { httpClient } from '@/services/http/client'
import type {
  WebhookEvent,
  WebhookEventDetail,
  WebhookEventFilters,
  WebhookEventList,
} from '@/types/webhooks'

// Refleja api/v1/admin_webhooks.py en nexolu-comms-api - mantener sincronizado.

export async function fetchWebhookEvents(filters: WebhookEventFilters): Promise<WebhookEventList> {
  const { data } = await httpClient.get<WebhookEventList>('/v1/admin/webhook-events', {
    params: filters,
  })
  return data
}

export async function fetchWebhookEvent(eventId: string): Promise<WebhookEventDetail> {
  const { data } = await httpClient.get<WebhookEventDetail>(`/v1/admin/webhook-events/${eventId}`)
  return data
}

export async function retryWebhookEvent(eventId: string): Promise<WebhookEvent> {
  const { data } = await httpClient.post<WebhookEvent>(`/v1/admin/webhook-events/${eventId}/retry`)
  return data
}

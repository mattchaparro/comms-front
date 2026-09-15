// Refleja WebhookEventOut / WebhookEventDetailOut / WebhookEventListOut
// (api/v1/admin_webhooks.py en nexolu-comms-api) - mantener sincronizado.

export const WEBHOOK_FORWARD_STATUSES = [
  'pending',
  'delivered',
  'failed',
  'dead',
  'skipped',
  'rejected',
] as const
export type WebhookForwardStatus = (typeof WEBHOOK_FORWARD_STATUSES)[number]

export const WEBHOOK_EVENT_TYPES = [
  'message',
  'order',
  'status',
  'template',
  'account',
  'unknown',
] as const

export interface WebhookEvent {
  id: string
  app_id: string
  event_type: string
  phone_number_id: string | null
  signature_valid: boolean | null
  forward_status: WebhookForwardStatus
  attempts: number
  next_retry_at: string | null
  last_error: string | null
  received_at: string
  delivered_at: string | null
}

export interface WebhookEventDetail extends WebhookEvent {
  payload: string
}

export interface WebhookEventList {
  total: number
  items: WebhookEvent[]
}

export interface WebhookEventFilters {
  app_id?: string
  forward_status?: WebhookForwardStatus
  event_type?: string
  limit?: number
  offset?: number
}

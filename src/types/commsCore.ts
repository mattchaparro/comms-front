// Reflejan los schemas de nexolu-comms-api (core/schemas.py y
// api/v1/usage.py) - este panel le habla directo, sin BFF. Mantener
// sincronizado si esos schemas cambian.

export interface CommsApp {
  id: string
  app_id: string
  name: string
  api_key_masked: string
  is_active: boolean
  has_meta_whatsapp: boolean
  has_brevo: boolean
  created_at: string
  updated_at: string
}

// Solo la respuesta de creacion/regeneracion trae api_key - comms-api no la
// vuelve a exponer en list/get (mismo patron que IaAppCreated).
export interface CommsAppCreated extends CommsApp {
  api_key: string
}

export interface CommsAppCreatePayload {
  app_id: string
  name?: string
}

export interface CommsAppUpdatePayload {
  name?: string
  is_active?: boolean
}

export interface MetaWhatsAppCredentialsPayload {
  phone_number_id: string
  access_token: string
  waba_id?: string | null
  webhook_verify_token?: string | null
  meta_app_secret?: string | null
  callback_secret?: string | null
  callback_url?: string | null
  enforce_meta_signature?: boolean
}

export interface MetaWhatsAppStatus {
  configured: boolean
  phone_number_id: string | null
  waba_id: string | null
  callback_url: string | null
  enforce_meta_signature: boolean
}

export interface MetaWhatsAppSecrets {
  access_token: string
  webhook_verify_token: string | null
  meta_app_secret: string | null
  callback_secret: string | null
}

export interface BrevoCredentialsPayload {
  from_email: string
  from_name?: string
  brevo_api_key: string
}

export interface BrevoStatus {
  configured: boolean
  from_email: string | null
  from_name: string | null
}

export interface BrevoSecrets {
  brevo_api_key: string
}

export const NOTIFICATION_CHANNELS = ['whatsapp', 'email'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export const NOTIFICATION_STATUSES = ['sent', 'failed', 'skipped'] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export interface Notification {
  id: string
  app_id: string
  business_id: string
  reference: string | null
  channel: NotificationChannel
  recipient: string
  status: NotificationStatus
  provider_message_id: string | null
  error: string | null
  cost_micros: number | null
  created_at: string
}

export interface NotificationFilters {
  app_id?: string
  business_id?: string
  channel?: NotificationChannel
  status?: NotificationStatus
  reference?: string
  limit?: number
  offset?: number
}

export interface NotificationList {
  notifications: Notification[]
  total: number
  limit: number
  offset: number
}

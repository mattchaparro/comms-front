// Refleja api/v1/admin_broadcasts.py en nexolu-comms-api - mantener sincronizado.

export type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'

export interface BroadcastAudience {
  last_visit_from?: string
  last_visit_to?: string
  no_visit_since?: string
  include_never?: boolean
  visits_min?: number | null
  visits_max?: number | null
  attended_by?: string
  tags_any?: string[]
  tags_none?: string[]
  require_marketing_opt_in?: boolean
}

export interface Broadcast {
  id: string
  app_id: string
  business_id: string
  name: string
  template_name: string
  template_language: string
  template_params: string[]
  audience: BroadcastAudience
  status: BroadcastStatus
  scheduled_at: string | null
  sent_at: string | null
  recipients: number
  created_by: string | null
  created_at: string
}

export interface BroadcastPayload {
  app_id: string
  business_id: string
  name: string
  template_name: string
  template_language: string
  template_params: string[]
  audience: BroadcastAudience
  // null = borrador. ISO con zona.
  scheduled_at: string | null
}

export interface BroadcastPreview {
  count: number
  category: string | null
  template_status: string | null
  sample: { name: string; phone: string }[]
}

export interface BroadcastReport {
  broadcast: Broadcast
  counts: { total: number; sent: number; delivered: number; read: number; failed: number; pending: number }
  delivered_total: number
  failures: { reason: string; count: number }[]
  responders: number
  buttons: { text: string; count: number }[]
}

export interface BroadcastRecipient {
  contact_id: string
  name: string
  phone: string
  status: string
  error: string | null
  sent_at: string | null
}

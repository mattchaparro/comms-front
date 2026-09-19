// Refleja AlertConfigIn / AlertConfigOut / AlertPreviewOut
// (api/v1/admin_alerts.py en nexolu-comms-api) - mantener sincronizado.

export interface InboxAlertConfig {
  id: string
  app_id: string
  business_id: string
  is_active: boolean
  emails: string[]
  whatsapp_to: string
  /** Plantilla del aviso urgente cuando la ventana de 24h está cerrada. */
  urgent_template: string
  urgent_template_language: string
  /** Minutos sin responder antes de avisar. */
  quiet_minutes: number
  created_at: string
  updated_at: string
}

export type InboxAlertPayload = Omit<InboxAlertConfig, 'id' | 'created_at' | 'updated_at'>

export interface InboxAlertPreview {
  pending: number
  subject: string | null
  body: string | null
}

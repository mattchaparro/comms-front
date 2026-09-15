// Refleja TemplateOut / TemplateCreateIn / TemplateSyncIn
// (api/v1/admin_templates.py en nexolu-comms-api) - mantener sincronizado.

export const TEMPLATE_CATEGORIES = ['UTILITY', 'MARKETING', 'AUTHENTICATION'] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export interface WhatsAppTemplate {
  id: string
  app_id: string
  business_channel_id: string | null
  waba_id: string
  name: string
  language: string
  category: TemplateCategory
  // Lo que Meta diga (PENDING/APPROVED/REJECTED/PAUSED/DISABLED/...), sin
  // lista cerrada: Meta agrega estados.
  status: string
  meta_template_id: string | null
  components: Record<string, unknown>[]
  quality_score: string | null
  reason: string | null
  last_synced_at: string | null
  created_at: string
}

export interface TemplateList {
  items: WhatsAppTemplate[]
}

export interface TemplateCreatePayload {
  app_id: string
  business_id?: string
  name: string
  language: string
  category: TemplateCategory
  components: Record<string, unknown>[]
}

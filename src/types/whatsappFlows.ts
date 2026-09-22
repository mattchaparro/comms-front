// Refleja los schemas de api/v1/admin_whatsapp_flows.py en nexolu-comms-api
// (WhatsAppFlowOut, FlowIssueOut, FlowGenerateOut, LibraryEntryOut...) -
// mantener sincronizado.
//
// En el panel estos se llaman "Formularios": son los WhatsApp Flows de Meta
// (formularios nativos dentro del chat), NO los flujos de Connect
// (types/flows.ts, el motor tipo ManyChat).

export const WHATSAPP_FLOW_CATEGORIES = [
  'APPOINTMENT_BOOKING',
  'LEAD_GENERATION',
  'CONTACT_US',
  'CUSTOMER_SUPPORT',
  'SURVEY',
  'SIGN_UP',
  'SIGN_IN',
  'OTHER',
] as const
export type WhatsAppFlowCategory = (typeof WHATSAPP_FLOW_CATEGORIES)[number]

export const WHATSAPP_FLOW_CATEGORY_LABELS: Record<WhatsAppFlowCategory, string> = {
  APPOINTMENT_BOOKING: 'Reserva de citas',
  LEAD_GENERATION: 'Captación de clientes',
  CONTACT_US: 'Contacto',
  CUSTOMER_SUPPORT: 'Soporte',
  SURVEY: 'Encuesta',
  SIGN_UP: 'Registro',
  SIGN_IN: 'Inicio de sesión',
  OTHER: 'Otro',
}

export interface FlowIssue {
  message: string
  // Ruta dentro del JSON (screens[0].layout...) o "linea N, col M" de Meta.
  path: string
  severity: 'error' | 'warning'
  // local = validador de Connect (antes de subir); meta = validador de Meta.
  source: 'local' | 'meta'
  line: number | null
}

export interface WhatsAppFlow {
  id: string
  app_id: string
  business_id: string | null
  business_channel_id: string | null
  waba_id: string
  // El flow_id que se usa para ENVIAR el formulario (whatsapp_flow.flow_id).
  meta_flow_id: string | null
  name: string
  categories: string[]
  // DRAFT | PUBLISHED | DEPRECATED | BLOCKED | THROTTLED - lo que Meta diga.
  status: string
  flow_json: Record<string, unknown> | null
  json_version: string | null
  validation_errors: FlowIssue[]
  preview_url: string | null
  preview_expires_at: string | null
  library_key: string | null
  last_synced_at: string | null
  published_at: string | null
  created_at: string
}

export interface WhatsAppFlowList {
  items: WhatsAppFlow[]
}

export interface FlowTarget {
  app_id: string
  // Con business_id, en la WABA propia de ese negocio; sin él, en la
  // compartida de la app.
  business_id?: string | null
}

export interface WhatsAppFlowCreatePayload extends FlowTarget {
  name: string
  categories: string[]
  flow_json: Record<string, unknown>
}

export interface WhatsAppFlowGeneratePayload extends FlowTarget {
  name: string
  categories: string[]
  description: string
}

export interface WhatsAppFlowGenerateResult {
  // null = ningún intento pasó el validador local: no se creó nada en Meta.
  flow: WhatsAppFlow | null
  flow_json: Record<string, unknown> | null
  issues: FlowIssue[]
  attempts: number
  ok: boolean
}

export interface FlowLibraryEntry {
  key: string
  name: string
  title: string
  description: string
  categories: string[]
  flow_json: Record<string, unknown>
}

/** El 422 del validador local: {detail: {message, issues}}. */
export interface FlowValidationErrorDetail {
  message: string
  issues: FlowIssue[]
}

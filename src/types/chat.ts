// Refleja ConversationOut / ChatMessageOut (api/v1/admin_chats.py en
// nexolu-comms-api) - mantener sincronizado.

export interface Conversation {
  contact_id: string
  app_id: string
  business_id: string
  phone: string
  name: string
  last_body: string
  last_direction: 'in' | 'out'
  last_at: string
  window_open: boolean
  unread: boolean
  assigned_to: string | null
  assigned_name: string | null
}

export interface ConversationList {
  items: Conversation[]
  /** Sin leer en TODO el scope, no solo en esta página. */
  unread_total: number
  has_more: boolean
}

export interface ChatMediaSend {
  kind: 'image' | 'video' | 'audio' | 'document'
  url: string
  caption?: string
  filename?: string
}

export interface ChatTemplateSend {
  name: string
  language: string
  /** Un texto por cada {{1}}, {{2}}... del cuerpo. */
  params: string[]
}

export interface ChatMessage {
  id: string
  direction: 'in' | 'out'
  message_type: string
  body: string
  payload: {
    buttons?: { id: string; title: string }[]
    rows?: { id: string; title: string; description?: string }[]
    list_button?: string | null
    cta_url?: string
    cta_title?: string | null
    media_kind?: string
    media_url?: string | null
    template?: string
    language?: string | null
  }
  status: string
  origin: string
  created_at: string
}

export interface ContactCard {
  contact_id: string
  app_id: string
  business_id: string
  phone: string
  name: string
  tags: string[]
  fields: Record<string, unknown>
  notes: string
  window_open: boolean
  assigned_to: string | null
  assigned_name: string | null
  first_seen_at: string | null
  last_inbound_at: string | null
  messages_in: number
  messages_out: number
}

export interface QuickReply {
  id: string
  app_id: string
  business_id: string
  /** Sin la barra: se teclea "/precios" y acá vive "precios". */
  shortcut: string
  title: string
  text: string
}

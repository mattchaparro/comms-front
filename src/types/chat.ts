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

// Refleja BusinessChannelOut (api/v1/admin_channels.py en nexolu-comms-api)
// - mantener sincronizado. Nunca incluye access_token ni pin: el backend no
// los expone (no hay "reveal" para canales, a proposito - reconectar es el
// camino, no copiar el token viejo).

export const CHANNEL_STATUSES = ['pending', 'active', 'disconnected'] as const
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number]

export interface BusinessChannel {
  id: string
  app_id: string
  business_id: string
  waba_id: string
  phone_number_id: string
  display_phone_number: string | null
  catalog_id: string | null
  status: ChannelStatus
  last_error: string | null
  connected_at: string | null
  disconnected_at: string | null
  created_at: string
}

export interface BusinessChannelList {
  items: BusinessChannel[]
}

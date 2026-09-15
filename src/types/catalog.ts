// Refleja api/v1/admin_catalog.py en nexolu-comms-api - mantener sincronizado.

export interface CatalogItem {
  id: string
  app_id: string
  business_channel_id: string | null
  catalog_id: string
  retailer_id: string
  title: string
  price: string
  availability: string
  sync_status: 'pending' | 'synced' | 'error'
  last_error: string | null
  last_synced_at: string | null
  updated_at: string
}

export interface CatalogSetupPayload {
  app_id: string
  business_id?: string
  catalog_id?: string
  name?: string
  meta_business_id?: string
}

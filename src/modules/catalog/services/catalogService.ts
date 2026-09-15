import { httpClient } from '@/services/http/client'
import type { CatalogItem, CatalogSetupPayload } from '@/types/catalog'

// Refleja api/v1/admin_catalog.py en nexolu-comms-api (por scope).

export async function fetchCatalogItems(appId?: string): Promise<CatalogItem[]> {
  const { data } = await httpClient.get<{ items: CatalogItem[] }>('/v1/admin/catalog-items', {
    params: appId ? { app_id: appId } : undefined,
  })
  return data.items
}

export async function checkCatalogItems(
  appId: string,
  businessId?: string,
): Promise<{ synced: number; errors: number; still_pending: number }> {
  const { data } = await httpClient.post('/v1/admin/catalog-items/check', {
    app_id: appId,
    business_id: businessId,
  })
  return data
}

export async function setupCatalog(
  payload: CatalogSetupPayload,
): Promise<{ catalog_id: string; connected_to_waba: boolean }> {
  const { data } = await httpClient.post('/v1/admin/catalogs', payload)
  return data
}

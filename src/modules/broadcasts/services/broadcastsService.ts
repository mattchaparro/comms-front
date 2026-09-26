import { httpClient } from '@/services/http/client'
import type {
  Broadcast,
  BroadcastPayload,
  BroadcastPreview,
  BroadcastRecipient,
  BroadcastReport,
} from '@/types/broadcasts'

// Refleja api/v1/admin_broadcasts.py en nexolu-comms-api.

export async function fetchBroadcasts(appId?: string): Promise<Broadcast[]> {
  const { data } = await httpClient.get<Broadcast[]>('/v1/admin/broadcasts', {
    params: appId ? { app_id: appId } : undefined,
  })
  return data
}

export async function previewBroadcast(payload: BroadcastPayload): Promise<BroadcastPreview> {
  const { data } = await httpClient.post<BroadcastPreview>('/v1/admin/broadcasts/preview', payload)
  return data
}

export async function createBroadcast(payload: BroadcastPayload): Promise<Broadcast> {
  const { data } = await httpClient.post<Broadcast>('/v1/admin/broadcasts', payload)
  return data
}

export async function updateBroadcast(id: string, payload: BroadcastPayload): Promise<Broadcast> {
  const { data } = await httpClient.put<Broadcast>(`/v1/admin/broadcasts/${id}`, payload)
  return data
}

export async function cancelBroadcast(id: string): Promise<Broadcast> {
  const { data } = await httpClient.post<Broadcast>(`/v1/admin/broadcasts/${id}/cancel`)
  return data
}

export async function deleteBroadcast(id: string): Promise<void> {
  await httpClient.delete(`/v1/admin/broadcasts/${id}`)
}

export async function fetchBroadcastReport(id: string): Promise<BroadcastReport> {
  const { data } = await httpClient.get<BroadcastReport>(`/v1/admin/broadcasts/${id}/report`)
  return data
}

export async function fetchBroadcastRecipients(id: string): Promise<BroadcastRecipient[]> {
  const { data } = await httpClient.get<BroadcastRecipient[]>(`/v1/admin/broadcasts/${id}/recipients`)
  return data
}

import { httpClient } from '@/services/http/client'
import type { Contact, Flow, FlowCreatePayload, FlowPatchPayload } from '@/types/flows'

// Refleja api/v1/admin_flows.py en nexolu-comms-api (autorizado por scope).

export async function fetchFlows(appId?: string): Promise<Flow[]> {
  const { data } = await httpClient.get<{ items: Flow[] }>('/v1/admin/flows', {
    params: appId ? { app_id: appId } : undefined,
  })
  return data.items
}

export async function createFlow(payload: FlowCreatePayload): Promise<Flow> {
  const { data } = await httpClient.post<Flow>('/v1/admin/flows', payload)
  return data
}

export async function updateFlow(flowId: string, payload: FlowPatchPayload): Promise<Flow> {
  const { data } = await httpClient.patch<Flow>(`/v1/admin/flows/${flowId}`, payload)
  return data
}

export async function deleteFlow(flowId: string): Promise<void> {
  await httpClient.delete(`/v1/admin/flows/${flowId}`)
}

export async function fetchContacts(appId?: string): Promise<Contact[]> {
  const { data } = await httpClient.get<{ items: Contact[] }>('/v1/admin/contacts', {
    params: appId ? { app_id: appId } : undefined,
  })
  return data.items
}

/** Sube una imagen/video/audio/pdf y devuelve la URL publica que Meta
 * descargara (bloque Imagen del builder). Refleja api/v1/admin_media.py. */
export async function uploadMedia(file: File): Promise<{ url: string; filename: string }> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await httpClient.post<{ url: string; filename: string }>(
    '/v1/admin/media',
    form,
  )
  return data
}

export async function updateContact(
  contactId: string,
  payload: { name?: string; tags?: string[]; fields?: Record<string, unknown> },
): Promise<Contact> {
  const { data } = await httpClient.patch<Contact>(`/v1/admin/contacts/${contactId}`, payload)
  return data
}

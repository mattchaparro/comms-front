import { httpClient } from '@/services/http/client'
import type {
  PanelUser,
  PanelUserCreatePayload,
  PanelUserList,
  PanelUserPatchPayload,
} from '@/types/users'

// Refleja api/v1/admin_users.py en nexolu-comms-api (solo plataforma).

export async function fetchPanelUsers(): Promise<PanelUser[]> {
  const { data } = await httpClient.get<PanelUserList>('/v1/admin/users')
  return data.items
}

export async function createPanelUser(payload: PanelUserCreatePayload): Promise<PanelUser> {
  const { data } = await httpClient.post<PanelUser>('/v1/admin/users', payload)
  return data
}

export async function updatePanelUser(
  userId: string,
  payload: PanelUserPatchPayload,
): Promise<PanelUser> {
  const { data } = await httpClient.patch<PanelUser>(`/v1/admin/users/${userId}`, payload)
  return data
}

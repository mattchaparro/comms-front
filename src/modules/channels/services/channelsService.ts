import { httpClient } from '@/services/http/client'
import type { BusinessChannel, BusinessChannelList } from '@/types/channels'

// Refleja api/v1/admin_channels.py en nexolu-comms-api - mantener sincronizado.

export async function fetchBusinessChannels(appId?: string): Promise<BusinessChannel[]> {
  const { data } = await httpClient.get<BusinessChannelList>('/v1/admin/business-channels', {
    params: appId ? { app_id: appId } : undefined,
  })
  return data.items
}

export async function disconnectBusinessChannel(channelId: string): Promise<BusinessChannel> {
  const { data } = await httpClient.post<BusinessChannel>(
    `/v1/admin/business-channels/${channelId}/disconnect`,
  )
  return data
}

import { httpClient } from '@/services/http/client'
import type {
  ChatMediaSend,
  ChatMessage,
  ChatTemplateSend,
  ContactCard,
  Conversation,
  ConversationList,
  QuickReply,
} from '@/types/chat'

// Refleja api/v1/admin_chats.py en nexolu-comms-api (autorizado por scope).

export async function fetchConversations(params: {
  appId?: string
  q?: string
  onlyUnread?: boolean
}): Promise<ConversationList> {
  const { data } = await httpClient.get<ConversationList>('/v1/admin/chats', {
    params: {
      app_id: params.appId || undefined,
      q: params.q?.trim() || undefined,
      only_unread: params.onlyUnread || undefined,
    },
  })
  return data
}

export async function markConversationRead(contactId: string): Promise<void> {
  await httpClient.post(`/v1/admin/chats/${contactId}/read`)
}

export async function assignConversation(
  contactId: string,
  userId: string | null,
): Promise<Conversation> {
  const { data } = await httpClient.post<Conversation>(`/v1/admin/chats/${contactId}/assign`, {
    user_id: userId,
  })
  return data
}

export async function sendChatMedia(
  contactId: string,
  media: ChatMediaSend,
): Promise<ChatMessage> {
  const { data } = await httpClient.post<ChatMessage>(`/v1/admin/chats/${contactId}/messages`, {
    media,
  })
  return data
}

export async function fetchThread(contactId: string): Promise<ChatMessage[]> {
  const { data } = await httpClient.get<ChatMessage[]>(`/v1/admin/chats/${contactId}/messages`)
  return data
}

export async function sendChatMessage(contactId: string, text: string): Promise<ChatMessage> {
  const { data } = await httpClient.post<ChatMessage>(`/v1/admin/chats/${contactId}/messages`, {
    text,
  })
  return data
}

/**
 * La plantilla es lo UNICO que WhatsApp entrega fuera de la ventana de 24h:
 * es como el panel rescata una conversacion fria sin depender de un flujo.
 */
export async function sendChatTemplate(
  contactId: string,
  template: ChatTemplateSend,
): Promise<ChatMessage> {
  const { data } = await httpClient.post<ChatMessage>(`/v1/admin/chats/${contactId}/messages`, {
    template,
  })
  return data
}

export async function fetchContactCard(contactId: string): Promise<ContactCard> {
  const { data } = await httpClient.get<ContactCard>(`/v1/admin/chats/${contactId}`)
  return data
}

export async function updateContactCard(
  contactId: string,
  patch: { name?: string; tags?: string[]; notes?: string },
): Promise<ContactCard> {
  const { data } = await httpClient.patch<ContactCard>(`/v1/admin/chats/${contactId}`, patch)
  return data
}

export async function fetchQuickReplies(appId?: string): Promise<QuickReply[]> {
  const { data } = await httpClient.get<QuickReply[]>('/v1/admin/quick-replies', {
    params: appId ? { app_id: appId } : undefined,
  })
  return data
}

export async function saveQuickReply(payload: {
  app_id: string
  business_id?: string
  shortcut: string
  title?: string
  text: string
}): Promise<QuickReply> {
  const { data } = await httpClient.put<QuickReply>('/v1/admin/quick-replies', payload)
  return data
}

export async function deleteQuickReply(id: string): Promise<void> {
  await httpClient.delete(`/v1/admin/quick-replies/${id}`)
}

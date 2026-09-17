import { httpClient } from '@/services/http/client'
import type { ChatMessage, ChatTemplateSend, Conversation } from '@/types/chat'

// Refleja api/v1/admin_chats.py en nexolu-comms-api (autorizado por scope).

export async function fetchConversations(appId?: string): Promise<Conversation[]> {
  const { data } = await httpClient.get<Conversation[]>('/v1/admin/chats', {
    params: appId ? { app_id: appId } : undefined,
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

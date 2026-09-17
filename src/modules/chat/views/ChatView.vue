<script setup lang="ts">
// La bandeja / live chat de Connect (la de ManyChat): conversaciones a la
// izquierda, el hilo estilo WhatsApp a la derecha y respuesta directa.
// Operativamente critica: el numero del negocio (Cloud API) no tiene app
// movil ni SIM - este ES el WhatsApp del negocio. El refresco es por
// polling corto (tiempo real de verdad queda para un websocket futuro).
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { computed, nextTick, ref, watch } from 'vue'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import type { Conversation } from '@/types/chat'

import { fetchConversations, fetchThread, sendChatMessage } from '../services/chatService'

const toast = useToast()
const queryClient = useQueryClient()

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))
const appFilter = ref<string | null>(null)

const { data: conversations, isLoading } = useQuery({
  queryKey: ['chats', appFilter] as const,
  queryFn: () => fetchConversations(appFilter.value ?? undefined),
  refetchInterval: 5000,
})

const selectedId = ref<string | null>(null)
const selected = computed<Conversation | null>(
  () => (conversations.value ?? []).find((c) => c.contact_id === selectedId.value) ?? null,
)

const { data: thread } = useQuery({
  queryKey: computed(() => ['chat-thread', selectedId.value] as const),
  queryFn: () => fetchThread(selectedId.value!),
  enabled: computed(() => selectedId.value !== null),
  refetchInterval: 4000,
})

const transcript = ref<HTMLElement | null>(null)
watch(
  () => thread.value?.length,
  () => void nextTick(() => transcript.value?.scrollTo({ top: 999999 })),
)

const reply = ref('')
const sendMutation = useMutation({
  mutationFn: () => sendChatMessage(selectedId.value!, reply.value.trim()),
  onSuccess: (message) => {
    reply.value = ''
    queryClient.invalidateQueries({ queryKey: ['chat-thread', selectedId.value] })
    queryClient.invalidateQueries({ queryKey: ['chats'] })
    if (message.status !== 'sent') {
      toast.add({
        severity: 'warn',
        summary: 'WhatsApp no lo entregó',
        detail: 'Probablemente la ventana de 24h está cerrada: usa una plantilla desde un flujo.',
        life: 7000,
      })
    }
  },
  onError: () => toast.add({ severity: 'error', summary: 'No se pudo enviar', life: 5000 }),
})

function send(): void {
  if (!reply.value.trim() || !selectedId.value || sendMutation.isPending.value) return
  sendMutation.mutate()
}

const MEDIA_ICONS: Record<string, string> = {
  image: 'pi pi-image',
  video: 'pi pi-video',
  audio: 'pi pi-volume-up',
  document: 'pi pi-paperclip',
  sticker: 'pi pi-face-smile',
}

function shortTime(iso: string): string {
  const date = new Date(`${iso}Z`)
  const today = new Date()
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}
</script>

<template>
  <div class="flex h-[calc(100vh-7.5rem)] min-h-[480px] flex-col">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Chat</h1>
        <p class="mt-1 text-sm text-slate-500">
          La conversación de WhatsApp del negocio, en vivo: lo que escribe la clienta, lo que
          responde el bot, y tus respuestas — sin necesitar el celular.
        </p>
      </div>
      <Select v-model="appFilter" :options="appOptions" placeholder="Todas las apps" show-clear class="w-48" />
    </div>

    <div class="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <!-- conversaciones -->
      <aside class="flex w-72 shrink-0 flex-col border-r border-slate-200">
        <div v-if="isLoading" class="p-4 text-sm text-slate-400">Cargando…</div>
        <div v-else-if="!(conversations ?? []).length" class="p-4 text-sm text-slate-400">
          Sin conversaciones todavía: aparecen con el primer mensaje entrante.
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <button
            v-for="convo in conversations ?? []"
            :key="convo.contact_id"
            type="button"
            class="flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-2.5 text-left transition-colors"
            :class="convo.contact_id === selectedId ? 'bg-teal-50' : 'hover:bg-slate-50'"
            @click="selectedId = convo.contact_id"
          >
            <span class="flex items-center gap-2">
              <span class="truncate text-sm font-semibold text-slate-800">
                {{ convo.name || convo.phone }}
              </span>
              <span
                class="ml-auto shrink-0 text-[10px]"
                :class="convo.window_open ? 'text-green-600' : 'text-slate-300'"
                :title="convo.window_open ? 'Ventana de 24h abierta' : 'Ventana cerrada (solo plantillas)'"
              >
                ●
              </span>
              <span class="shrink-0 text-[10px] text-slate-400">{{ shortTime(convo.last_at) }}</span>
            </span>
            <span class="truncate text-xs text-slate-500">
              <i v-if="convo.last_direction === 'out'" class="pi pi-reply mr-1 text-[9px]" />
              {{ convo.last_body || '(multimedia)' }}
            </span>
          </button>
        </div>
      </aside>

      <!-- hilo -->
      <div class="flex min-w-0 flex-1 flex-col">
        <template v-if="selected">
          <div class="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-2.5">
            <span class="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700">
              {{ (selected.name || selected.phone).slice(0, 1).toUpperCase() }}
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-slate-800">{{ selected.name || selected.phone }}</p>
              <p class="text-[11px] text-slate-400">{{ selected.phone }} · {{ selected.app_id }}</p>
            </div>
            <Tag
              class="ml-auto"
              :severity="selected.window_open ? 'success' : 'secondary'"
              :value="selected.window_open ? 'Ventana 24h abierta' : 'Ventana cerrada'"
            />
          </div>

          <div ref="transcript" class="min-h-0 flex-1 overflow-y-auto bg-[#e5ddd5] p-4">
            <div class="mx-auto flex max-w-2xl flex-col gap-1.5">
              <div
                v-for="message in thread ?? []"
                :key="message.id"
                class="flex flex-col"
                :class="message.direction === 'out' ? 'items-end' : 'items-start'"
              >
                <div
                  class="max-w-[75%] rounded-xl px-3 py-1.5 text-[13px] leading-relaxed shadow-sm"
                  :class="
                    message.direction === 'out'
                      ? 'rounded-tr-sm bg-[#d9fdd3] text-slate-800'
                      : 'rounded-tl-sm bg-white text-slate-800'
                  "
                >
                  <p v-if="message.payload.media_kind || MEDIA_ICONS[message.message_type]" class="mb-0.5 text-slate-500">
                    <i :class="MEDIA_ICONS[message.payload.media_kind ?? message.message_type] ?? 'pi pi-file'" class="mr-1 text-xs" />
                    <a
                      v-if="message.payload.media_url"
                      :href="message.payload.media_url"
                      target="_blank"
                      class="text-teal-700 underline"
                    >
                      {{ message.payload.media_kind ?? message.message_type }}
                    </a>
                    <template v-else>{{ message.payload.media_kind ?? message.message_type }}</template>
                  </p>
                  <p v-if="message.payload.template" class="text-[11px] italic text-fuchsia-700">
                    Plantilla «{{ message.payload.template }}»
                  </p>
                  <p class="whitespace-pre-wrap">{{ message.body }}</p>
                  <div
                    v-for="option in [...(message.payload.buttons ?? []), ...(message.payload.rows ?? [])]"
                    :key="option.id"
                    class="mt-1 rounded border border-slate-200/70 py-0.5 text-center text-[11px] text-teal-700"
                  >
                    {{ option.title }}
                  </div>
                  <p class="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-slate-400">
                    <span v-if="message.origin === 'flow'" title="Enviado por un flujo">🤖</span>
                    {{ shortTime(message.created_at) }}
                    <i
                      v-if="message.direction === 'out'"
                      :class="message.status === 'sent' ? 'pi pi-check text-teal-600' : 'pi pi-exclamation-circle text-red-400'"
                      class="text-[9px]"
                      :title="message.status === 'sent' ? 'Enviado' : 'Falló (¿ventana cerrada?)'"
                    />
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2 border-t border-slate-100 p-3">
            <InputText
              v-model="reply"
              :placeholder="selected.window_open ? 'Escribe tu respuesta…' : 'Ventana cerrada: WhatsApp puede rechazar texto libre'"
              fluid
              class="!text-sm"
              @keyup.enter="send"
            />
            <Button icon="pi pi-send" :loading="sendMutation.isPending.value" @click="send" />
          </div>
        </template>

        <div v-else class="flex flex-1 items-center justify-center text-sm text-slate-400">
          Elige una conversación para leer y responder.
        </div>
      </div>
    </div>
  </div>
</template>

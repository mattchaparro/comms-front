<script setup lang="ts">
// La bandeja / live chat de Connect (la de ManyChat): conversaciones a la
// izquierda, el hilo estilo WhatsApp a la derecha y respuesta directa.
// Operativamente critica: el numero del negocio (Cloud API) no tiene app
// movil ni SIM - este ES el WhatsApp del negocio. El refresco es por
// polling corto (tiempo real de verdad queda para un websocket futuro).
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { computed, nextTick, ref, watch } from 'vue'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import { uploadMedia } from '@/modules/flows/services/flowsService'
import TemplatePreview from '@/modules/templates/components/TemplatePreview.vue'
import { fetchTemplates } from '@/modules/templates/services/templatesService'
import { fetchPanelUsers } from '@/modules/users/services/usersService'
import { useAuthStore } from '@/stores/auth.store'
import type { Conversation } from '@/types/chat'
import type { WhatsAppTemplate } from '@/types/templates'

import {
  assignConversation,
  fetchConversations,
  fetchThread,
  markConversationRead,
  sendChatMedia,
  sendChatMessage,
  sendChatTemplate,
} from '../services/chatService'

const toast = useToast()
const queryClient = useQueryClient()
const auth = useAuthStore()

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))
const appFilter = ref<string | null>(null)
const search = ref('')
const onlyUnread = ref(false)

const { data: inbox, isLoading } = useQuery({
  queryKey: computed(() => ['chats', appFilter.value, search.value, onlyUnread.value] as const),
  queryFn: () =>
    fetchConversations({
      appId: appFilter.value ?? undefined,
      q: search.value,
      onlyUnread: onlyUnread.value,
    }),
  refetchInterval: 5000,
})

const conversations = computed(() => inbox.value?.items ?? [])
const unreadTotal = computed(() => inbox.value?.unread_total ?? 0)

const selectedId = ref<string | null>(null)
const selected = computed<Conversation | null>(
  () => conversations.value.find((c) => c.contact_id === selectedId.value) ?? null,
)

// Abrir un hilo lo marca leído: es lo que hace que el contador signifique
// "hay gente esperando" y no "hay conversaciones".
async function openConversation(contactId: string): Promise<void> {
  selectedId.value = contactId
  try {
    await markConversationRead(contactId)
    queryClient.invalidateQueries({ queryKey: ['chats'] })
  } catch {
    // Que falle marcar leído no puede impedir leer.
  }
}

// -- Quién atiende --------------------------------------------------------

const { data: panelUsers } = useQuery({
  queryKey: ['panel-users'] as const,
  queryFn: fetchPanelUsers,
  // Solo la plataforma puede listar usuarios; un cliente externo ve el
  // nombre de quien atiende, pero no reasigna.
  enabled: computed(() => auth.isPlatform),
})

const assignOptions = computed(() => [
  { label: 'Sin asignar', value: null },
  ...(panelUsers.value ?? []).map((u) => ({ label: u.full_name || u.email, value: u.id })),
])

const assignMutation = useMutation({
  mutationFn: (userId: string | null) => assignConversation(selectedId.value!, userId),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chats'] }),
  onError: () => toast.add({ severity: 'error', summary: 'No se pudo asignar', life: 4000 }),
})

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

// -- Adjuntar una imagen -------------------------------------------------

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

async function attach(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // permite volver a elegir el mismo archivo
  if (!file || !selectedId.value) return

  uploading.value = true
  try {
    // Meta descarga el archivo por link público: primero vive en comms
    // (/v1/admin/media) y después se manda la URL.
    const { url } = await uploadMedia(file)
    const message = await sendChatMedia(selectedId.value, {
      kind: file.type.startsWith('image/') ? 'image' : 'document',
      url,
      caption: reply.value.trim() || undefined,
      filename: file.name,
    })
    reply.value = ''
    queryClient.invalidateQueries({ queryKey: ['chat-thread', selectedId.value] })
    queryClient.invalidateQueries({ queryKey: ['chats'] })
    if (message.status !== 'sent') {
      toast.add({ severity: 'warn', summary: 'WhatsApp no lo entregó', life: 6000 })
    }
  } catch {
    toast.add({ severity: 'error', summary: 'No se pudo enviar el archivo', life: 5000 })
  } finally {
    uploading.value = false
  }
}

// -- Plantillas: la unica salida cuando la ventana de 24h ya cerro --------

const templateDialog = ref(false)
const chosenTemplate = ref<WhatsAppTemplate | null>(null)
const templateParams = ref<string[]>([])

const { data: templates } = useQuery({
  queryKey: computed(() => ['chat-templates', selected.value?.app_id] as const),
  queryFn: () => fetchTemplates(selected.value?.app_id),
  enabled: computed(() => templateDialog.value && selected.value !== null),
})

// Solo las aprobadas: Meta rechaza el resto, y ofrecerlas es prometerle al
// operador un envio que no va a salir.
const sendableTemplates = computed(() =>
  (templates.value ?? []).filter((t) => t.status === 'APPROVED'),
)

function bodyOf(template: WhatsAppTemplate): string {
  const body = template.components.find((c) => String(c.type).toUpperCase() === 'BODY')
  return typeof body?.text === 'string' ? body.text : ''
}

/** Cuantas variables pide el cuerpo: el mayor {{n}} que aparezca. */
function paramCount(template: WhatsAppTemplate): number {
  const found = [...bodyOf(template).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
  return found.length ? Math.max(...found) : 0
}

/** La etiqueta del campo. Se arma acá: las llaves dobles dentro de una
 * interpolación de Vue rompen el parser de plantillas. */
function paramLabel(index: number): string {
  return `{{${index + 1}}}`
}

function pickTemplate(template: WhatsAppTemplate): void {
  chosenTemplate.value = template
  templateParams.value = Array.from({ length: paramCount(template) }, () => '')
}

function openTemplates(): void {
  chosenTemplate.value = null
  templateParams.value = []
  templateDialog.value = true
}

const templateReady = computed(
  () => chosenTemplate.value !== null && templateParams.value.every((p) => p.trim().length > 0),
)

const templateMutation = useMutation({
  mutationFn: () =>
    sendChatTemplate(selectedId.value!, {
      name: chosenTemplate.value!.name,
      language: chosenTemplate.value!.language,
      params: templateParams.value.map((p) => p.trim()),
    }),
  onSuccess: (message) => {
    templateDialog.value = false
    queryClient.invalidateQueries({ queryKey: ['chat-thread', selectedId.value] })
    queryClient.invalidateQueries({ queryKey: ['chats'] })
    toast.add({
      severity: message.status === 'sent' ? 'success' : 'warn',
      summary: message.status === 'sent' ? 'Plantilla enviada' : 'WhatsApp no la entregó',
      life: 5000,
    })
  },
  onError: (error: unknown) => {
    // El 409 del backend trae el motivo real (plantilla no aprobada).
    const detail =
      (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
      'No se pudo enviar la plantilla.'
    toast.add({ severity: 'error', summary: 'No se envió', detail, life: 8000 })
  },
})

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
        <h1 class="flex items-center gap-2 text-2xl font-bold text-slate-900">
          Chat
          <span
            v-if="unreadTotal"
            class="rounded-full bg-teal-600 px-2 py-0.5 text-xs font-semibold text-white"
            :title="`${unreadTotal} sin responder`"
          >
            {{ unreadTotal }}
          </span>
        </h1>
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
        <div class="shrink-0 border-b border-slate-100 p-2">
          <InputText
            v-model="search"
            placeholder="Buscar por nombre, teléfono o texto…"
            fluid
            class="!text-xs"
          />
          <button
            type="button"
            class="mt-1.5 w-full rounded px-2 py-1 text-left text-[11px] transition-colors"
            :class="onlyUnread ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:bg-slate-50'"
            @click="onlyUnread = !onlyUnread"
          >
            <i class="pi pi-inbox mr-1 text-[10px]" />
            {{ onlyUnread ? 'Viendo solo sin responder' : 'Ver solo sin responder' }}
          </button>
        </div>

        <div v-if="isLoading" class="p-4 text-sm text-slate-400">Cargando…</div>
        <div v-else-if="!conversations.length" class="p-4 text-sm text-slate-400">
          {{
            search || onlyUnread
              ? 'Nada coincide con lo que buscas.'
              : 'Sin conversaciones todavía: aparecen con el primer mensaje entrante.'
          }}
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <button
            v-for="convo in conversations"
            :key="convo.contact_id"
            type="button"
            class="flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-2.5 text-left transition-colors"
            :class="convo.contact_id === selectedId ? 'bg-teal-50' : 'hover:bg-slate-50'"
            @click="openConversation(convo.contact_id)"
          >
            <span class="flex items-center gap-2">
              <!-- El punto teal es "te están esperando": lo único que hace
                   que la lista se lea de un vistazo. -->
              <span
                v-if="convo.unread"
                class="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600"
                title="Sin responder"
              />
              <span
                class="truncate text-sm text-slate-800"
                :class="convo.unread ? 'font-bold' : 'font-semibold'"
              >
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
            <span v-if="convo.assigned_name" class="truncate text-[10px] text-teal-700">
              <i class="pi pi-user mr-1 text-[9px]" />{{ convo.assigned_name }}
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
            <!-- Quién atiende: no bloquea a nadie, avisa. Un cliente
                 externo lo ve pero no reasigna (no lista usuarios). -->
            <Select
              v-if="auth.isPlatform"
              :model-value="selected.assigned_to"
              :options="assignOptions"
              option-label="label"
              option-value="value"
              placeholder="Sin asignar"
              class="ml-auto !text-xs"
              :loading="assignMutation.isPending.value"
              @update:model-value="assignMutation.mutate($event)"
            />
            <span v-else-if="selected.assigned_name" class="ml-auto text-xs text-teal-700">
              <i class="pi pi-user mr-1 text-[10px]" />{{ selected.assigned_name }}
            </span>
            <Tag
              :class="auth.isPlatform ? '' : 'ml-auto'"
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

          <div class="shrink-0 border-t border-slate-100 p-3">
            <!--
              Ventana cerrada: el texto libre NO se entrega (Meta lo acepta y
              lo descarta). Decirlo aquí, con el botón de plantilla al lado,
              es la diferencia entre rescatar la conversación y creer que se
              contestó.
            -->
            <p
              v-if="!selected.window_open"
              class="mb-2 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
            >
              Pasaron más de 24 horas desde su último mensaje: WhatsApp solo entrega una
              <strong>plantilla</strong> aprobada.
            </p>
            <div class="flex items-center gap-2">
              <input ref="fileInput" type="file" class="hidden" accept="image/*,.pdf" @change="attach" />
              <Button
                icon="pi pi-paperclip"
                severity="secondary"
                outlined
                :loading="uploading"
                title="Adjuntar imagen o PDF (el texto escrito va como pie)"
                @click="fileInput?.click()"
              />
              <Button
                icon="pi pi-file"
                :severity="selected.window_open ? 'secondary' : 'warn'"
                :outlined="selected.window_open"
                label="Plantilla"
                class="!text-xs"
                @click="openTemplates"
              />
              <InputText
                v-model="reply"
                :placeholder="selected.window_open ? 'Escribe tu respuesta…' : 'Ventana cerrada: usa una plantilla'"
                fluid
                class="!text-sm"
                @keyup.enter="send"
              />
              <Button icon="pi pi-send" :loading="sendMutation.isPending.value" @click="send" />
            </div>
          </div>
        </template>

        <div v-else class="flex flex-1 items-center justify-center text-sm text-slate-400">
          Elige una conversación para leer y responder.
        </div>
      </div>
    </div>

    <Dialog
      v-model:visible="templateDialog"
      modal
      header="Enviar una plantilla"
      class="w-[44rem] max-w-[95vw]"
    >
      <p class="mb-3 text-xs text-slate-500">
        Solo se listan las plantillas <strong>aprobadas</strong> por Meta de esta app. Se cobran
        como utility.
      </p>

      <div v-if="!sendableTemplates.length" class="rounded-md bg-slate-50 p-4 text-sm text-slate-500">
        No hay plantillas aprobadas todavía. Créalas y sincronízalas en la pantalla de Plantillas.
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2">
        <div class="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
          <button
            v-for="template in sendableTemplates"
            :key="template.id"
            type="button"
            class="flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-2 text-left"
            :class="chosenTemplate?.id === template.id ? 'bg-teal-50' : 'hover:bg-slate-50'"
            @click="pickTemplate(template)"
          >
            <span class="text-sm font-semibold text-slate-800">{{ template.name }}</span>
            <span class="truncate text-[11px] text-slate-500">
              {{ template.language }} · {{ bodyOf(template) || '(sin cuerpo)' }}
            </span>
          </button>
        </div>

        <div v-if="chosenTemplate" class="flex flex-col gap-3">
          <TemplatePreview :components="chosenTemplate.components" :params="templateParams" />
          <div v-if="templateParams.length" class="flex flex-col gap-2">
            <label
              v-for="(_, index) in templateParams"
              :key="index"
              class="flex items-center gap-2 text-xs text-slate-600"
            >
              <span class="w-12 shrink-0 font-mono">{{ paramLabel(index) }}</span>
              <InputText v-model="templateParams[index]" fluid class="!text-sm" />
            </label>
          </div>
          <p v-else class="text-xs text-slate-400">Esta plantilla no lleva variables.</p>
        </div>
        <p v-else class="self-center text-sm text-slate-400">Elige una plantilla para verla.</p>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="templateDialog = false" />
        <Button
          label="Enviar"
          icon="pi pi-send"
          :disabled="!templateReady"
          :loading="templateMutation.isPending.value"
          @click="templateMutation.mutate()"
        />
      </template>
    </Dialog>
  </div>
</template>

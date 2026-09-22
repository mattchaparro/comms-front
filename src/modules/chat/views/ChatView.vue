<script setup lang="ts">
// La bandeja / live chat de Connect (la de ManyChat): conversaciones a la
// izquierda, el hilo estilo WhatsApp a la derecha y respuesta directa.
// Operativamente critica: el numero del negocio (Cloud API) no tiene app
// movil ni SIM - este ES el WhatsApp del negocio. El refresco es por
// polling corto (tiempo real de verdad queda para un websocket futuro).
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
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

import ContactSidebar from '../components/ContactSidebar.vue'
import InboxAlertsDialog from '../components/InboxAlertsDialog.vue'
import {
  assignConversation,
  fetchConversations,
  fetchQuickReplies,
  fetchThread,
  markConversationRead,
  sendChatMedia,
  sendChatMessage,
  sendChatTemplate,
} from '../services/chatService'

/**
 * Embebida en el panel de otra app (EmbeddedChatView): sin barra superior
 * ni padding alrededor, así que ocupa el iframe entero.
 */
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const toast = useToast()
const queryClient = useQueryClient()
const auth = useAuthStore()

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))
const appFilter = ref<string | null>(null)
const search = ref('')
const onlyUnread = ref(false)
const alertsDialog = ref(false)

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

/*
 * En el celular la bandeja funciona como WhatsApp: se ve la lista O la
 * conversación, nunca las tres columnas apretadas en 375 px. Volver es
 * cerrar el hilo. La ficha del contacto, que en escritorio va al lado,
 * en pantallas angostas se abre como panel desde el botón (i).
 */
const contactDrawer = ref(false)

function closeConversation(): void {
  selectedId.value = null
  contactDrawer.value = false
}

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

// -- Respuestas guardadas: "/precios" ------------------------------------

const { data: quickReplies } = useQuery({
  queryKey: computed(() => ['quick-replies', selected.value?.app_id] as const),
  queryFn: () => fetchQuickReplies(selected.value?.app_id),
  enabled: computed(() => selected.value !== null),
})

// El menú aparece mientras se escribe "/algo" y filtra por atajo o
// título. Sin esto habría que abrir otra pantalla a copiar el texto, que
// es justo lo que la respuesta guardada venía a evitar.
const quickMatches = computed(() => {
  const match = /^\/(\S*)$/.exec(reply.value)
  if (match === null) return []
  const needle = match[1].toLowerCase()
  return (quickReplies.value ?? []).filter(
    (q) => q.shortcut.includes(needle) || q.title.toLowerCase().includes(needle),
  )
})

function useQuickReply(text: string): void {
  reply.value = text
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

/**
 * Por qué no le llegó, en palabras de quien atiende.
 *
 * Meta devuelve códigos ("#131030 Recipient phone number not in allowed
 * list") que no le dicen nada a una recepcionista. Los que de verdad
 * pasan se traducen a lo que hay que HACER; el resto se muestra tal cual,
 * que es mejor que adivinar.
 */
function motivoDelFallo(error: unknown): string {
  const texto = typeof error === 'string' ? error : ''

  if (texto.includes('131030')) {
    return 'Estamos en el número de prueba de Meta y este teléfono no está en su lista permitida.'
  }
  if (texto.includes('131047') || texto.includes('131026')) {
    return 'Pasaron más de 24 horas desde que escribió: solo se le puede mandar una plantilla.'
  }
  if (texto.includes('131021')) {
    return 'Es el mismo número del negocio.'
  }

  return texto ? `Meta respondió: ${texto}` : 'WhatsApp no lo entregó.'
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
  <!--
    Alto = la pantalla menos la barra superior y el padding del main
    (h-14 + p-3 en celular, h-16 + p-6 desde sm). dvh y no vh: en el
    celular la barra del navegador aparece y desaparece, y con vh la caja
    de escribir quedaba escondida detrás de ella.
  -->
  <div
    class="flex min-h-[420px] flex-col"
    :class="
      props.embedded
        ? 'h-dvh sm:p-3'
        : '-m-3 h-[calc(100dvh-3.5rem)] sm:m-0 sm:h-[calc(100dvh-7rem)]'
    "
  >
    <!-- Con una conversación abierta en el celular, la cabecera de la
         página sobra: cada renglón es espacio que le quita al hilo. -->
    <div
      class="mb-3 items-center justify-between gap-3 px-3 pt-3 sm:mb-4 sm:px-0 sm:pt-0"
      :class="selectedId ? 'hidden md:flex' : 'flex'"
    >
      <div class="min-w-0">
        <h1 class="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
          Chat
          <span
            v-if="unreadTotal"
            class="rounded-full bg-teal-600 px-2 py-0.5 text-xs font-semibold text-white"
            :title="`${unreadTotal} sin responder`"
          >
            {{ unreadTotal }}
          </span>
        </h1>
        <p class="mt-1 hidden text-sm text-slate-500 md:block">
          La conversación de WhatsApp del negocio, en vivo: lo que escribe la clienta, lo que
          responde el bot, y tus respuestas — sin necesitar el celular.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button
          icon="pi pi-bell"
          label="Avisos"
          severity="secondary"
          outlined
          class="!text-xs [&_.p-button-label]:hidden sm:[&_.p-button-label]:inline"
          title="A quién avisar cuando hay conversaciones sin responder"
          aria-label="Avisos"
          @click="alertsDialog = true"
        />
        <!-- Un filtro con una sola opción no filtra nada: ocupa sitio y
             hace dudar. Se ve cuando de verdad hay entre qué elegir, que
             es el panel de Nexolú; dentro del panel de un negocio, no. -->
        <Select
          v-if="appOptions.length > 1"
          v-model="appFilter"
          :options="appOptions"
          placeholder="Todas las apps"
          show-clear
          class="w-36 sm:w-48"
        />
      </div>
    </div>

    <InboxAlertsDialog v-model:visible="alertsDialog" :apps="appOptions" :default-app="appFilter" />

    <div
      class="flex min-h-0 flex-1 overflow-hidden border-slate-200 bg-white sm:rounded-xl sm:border"
      :class="selectedId ? 'border-t-0' : 'border-t'"
    >
      <!-- conversaciones: en el celular ocupan todo el ancho y se
           esconden al abrir una -->
      <aside
        class="w-full shrink-0 flex-col border-slate-200 md:flex md:w-72 md:border-r"
        :class="selectedId ? 'hidden' : 'flex'"
      >
        <div class="shrink-0 border-b border-slate-100 p-2">
          <InputText
            v-model="search"
            placeholder="Buscar por nombre, teléfono o texto…"
            fluid
            class="!text-xs"
          />
          <button
            type="button"
            class="mt-1.5 w-full rounded px-2 py-2 text-left text-xs transition-colors sm:py-1 sm:text-[11px]"
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
            class="flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-3 text-left transition-colors md:py-2.5"
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
            <!-- Una respuesta que no llegó se ve como lo que es: alguien
                 esperando. Si se pintara igual que una respuesta, la
                 conversación parecería atendida. -->
            <span v-if="convo.last_failed" class="truncate text-xs font-medium text-red-600">
              <i class="pi pi-exclamation-circle mr-1 text-[10px]" />No le llegó la respuesta
            </span>
            <span v-else class="truncate text-xs text-slate-500">
              <i v-if="convo.last_direction === 'out'" class="pi pi-reply mr-1 text-[9px]" />
              {{ convo.last_body || '(multimedia)' }}
            </span>
            <!--
              De qué número es esta conversación. Una misma persona le puede
              escribir a dos negocios distintos del ecosistema, y sin esto la
              lista muestra su nombre dos veces sin explicar por qué.
            -->
            <span v-if="appOptions.length > 1" class="truncate text-[10px] text-slate-400">
              {{ convo.app_id }}
            </span>
            <span v-if="convo.assigned_name" class="truncate text-[10px] text-teal-700">
              <i class="pi pi-user mr-1 text-[9px]" />{{ convo.assigned_name }}
            </span>
          </button>
        </div>
      </aside>

      <!-- hilo: en el celular solo existe con una conversación abierta -->
      <div
        class="min-w-0 flex-1 flex-col md:flex"
        :class="selectedId ? 'flex' : 'hidden'"
      >
        <template v-if="selected">
          <div class="flex shrink-0 items-center gap-2 border-b border-slate-100 px-1 py-1.5 sm:gap-3 sm:px-4 sm:py-2.5">
            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 active:bg-slate-100 md:hidden"
              aria-label="Volver a las conversaciones"
              @click="closeConversation"
            >
              <i class="pi pi-arrow-left" />
            </button>
            <span class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700">
              {{ (selected.name || selected.phone).slice(0, 1).toUpperCase() }}
              <!-- La ventana de 24h, en el celular como un punto sobre el
                   avatar: el aviso grande del compositor ya dice qué hacer. -->
              <span
                class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white sm:hidden"
                :class="selected.window_open ? 'bg-green-500' : 'bg-slate-300'"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-slate-800">{{ selected.name || selected.phone }}</p>
              <!-- La app solo se nombra si hay más de una a la vista. En la
                   bandeja embebida en el panel de un negocio, "· spa" no le
                   dice nada a nadie: ahí todo es spa. -->
              <p class="truncate text-[11px] text-slate-400">
                {{ selected.phone }}<template v-if="appOptions.length > 1"> · {{ selected.app_id }}</template>
              </p>
            </div>
            <!-- Quién atiende: no bloquea a nadie, avisa. Un cliente
                 externo lo ve pero no reasigna (no lista usuarios). En el
                 celular vive dentro de la ficha (i). -->
            <Select
              v-if="auth.isPlatform"
              :model-value="selected.assigned_to"
              :options="assignOptions"
              option-label="label"
              option-value="value"
              placeholder="Sin asignar"
              class="!hidden !text-xs md:!inline-flex"
              :loading="assignMutation.isPending.value"
              @update:model-value="assignMutation.mutate($event)"
            />
            <span v-else-if="selected.assigned_name" class="hidden text-xs text-teal-700 md:inline">
              <i class="pi pi-user mr-1 text-[10px]" />{{ selected.assigned_name }}
            </span>
            <Tag
              class="!hidden sm:!inline-flex"
              :severity="selected.window_open ? 'success' : 'secondary'"
              :value="selected.window_open ? 'Ventana 24h abierta' : 'Ventana cerrada'"
            />
            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-100 xl:hidden"
              aria-label="Ver la ficha del contacto"
              @click="contactDrawer = true"
            >
              <i class="pi pi-info-circle text-lg" />
            </button>
          </div>

          <div ref="transcript" class="min-h-0 flex-1 overflow-y-auto bg-[#e5ddd5] p-2 sm:p-4">
            <div class="mx-auto flex max-w-2xl flex-col gap-1.5">
              <div
                v-for="message in thread ?? []"
                :key="message.id"
                class="flex flex-col"
                :class="message.direction === 'out' ? 'items-end' : 'items-start'"
              >
                <div
                  class="max-w-[88%] rounded-xl px-3 py-1.5 text-sm leading-relaxed shadow-sm sm:max-w-[75%] sm:text-[13px]"
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
                      :class="message.status === 'failed' ? 'pi pi-exclamation-circle text-red-500' : 'pi pi-check text-teal-600'"
                      class="text-[9px]"
                      :title="message.status === 'failed' ? 'No se entregó' : 'Enviado'"
                    />
                  </p>
                  <!-- El motivo, en palabras de quien atiende. Un ícono
                       rojo de 9 px no lo ve nadie, y la clienta se queda
                       esperando una respuesta que el panel da por enviada. -->
                  <p
                    v-if="message.direction === 'out' && message.status === 'failed'"
                    class="mt-1 rounded bg-red-50 px-2 py-1 text-left text-[11px] text-red-700"
                  >
                    No le llegó. {{ motivoDelFallo(message.payload?.error) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="relative shrink-0 border-t border-slate-100 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
            <!-- Respuestas guardadas: aparecen al escribir "/". -->
            <div
              v-if="quickMatches.length"
              class="absolute bottom-full left-3 right-3 mb-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
            >
              <button
                v-for="quick in quickMatches"
                :key="quick.id"
                type="button"
                class="flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-2 text-left hover:bg-teal-50"
                @click="useQuickReply(quick.text)"
              >
                <span class="text-xs font-semibold text-slate-700">/{{ quick.shortcut }}</span>
                <span class="truncate text-[11px] text-slate-500">{{ quick.text }}</span>
              </button>
            </div>

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
            <div class="flex items-center gap-1.5 sm:gap-2">
              <input ref="fileInput" type="file" class="hidden" accept="image/*,.pdf" @change="attach" />
              <Button
                icon="pi pi-paperclip"
                severity="secondary"
                text
                rounded
                class="shrink-0 sm:!border sm:!border-slate-300"
                :loading="uploading"
                title="Adjuntar imagen o PDF (el texto escrito va como pie)"
                aria-label="Adjuntar"
                @click="fileInput?.click()"
              />
              <!-- En el celular solo el ícono: la palabra se come el ancho
                   que necesita la caja de escribir. -->
              <Button
                icon="pi pi-file"
                :severity="selected.window_open ? 'secondary' : 'warn'"
                :outlined="selected.window_open"
                label="Plantilla"
                aria-label="Enviar una plantilla"
                class="shrink-0 !text-xs [&_.p-button-label]:hidden sm:[&_.p-button-label]:inline"
                @click="openTemplates"
              />
              <InputText
                v-model="reply"
                :placeholder="selected.window_open ? 'Escribe tu respuesta…' : 'Ventana cerrada: usa una plantilla'"
                class="min-w-0 flex-1 !rounded-full !text-sm"
                enterkeyhint="send"
                @keyup.enter="send"
              />
              <Button
                icon="pi pi-send"
                rounded
                class="shrink-0"
                aria-label="Enviar"
                :loading="sendMutation.isPending.value"
                @click="send"
              />
            </div>
          </div>
        </template>

        <div v-else class="flex flex-1 items-center justify-center text-sm text-slate-400">
          Elige una conversación para leer y responder.
        </div>
      </div>

      <!--
        Quién es esta persona, al lado del hilo. Solo lo que Connect sabe:
        la ficha de negocio (citas, pedidos) la pinta la app dueña cuando
        embeba esta bandeja.
      -->
      <ContactSidebar
        v-if="selectedId"
        :key="selectedId"
        :contact-id="selectedId"
        class="!hidden xl:!flex"
      />
    </div>

    <!-- La ficha en pantallas angostas: un panel que se abre desde (i),
         con el "quién atiende" que en el celular no cabe en la cabecera. -->
    <Drawer
      v-model:visible="contactDrawer"
      position="right"
      header="Contacto"
      class="!w-[min(22rem,100vw)] xl:!hidden"
    >
      <div v-if="selected && auth.isPlatform" class="mb-4">
        <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Quién atiende</p>
        <Select
          :model-value="selected.assigned_to"
          :options="assignOptions"
          option-label="label"
          option-value="value"
          placeholder="Sin asignar"
          fluid
          :loading="assignMutation.isPending.value"
          @update:model-value="assignMutation.mutate($event)"
        />
      </div>
      <ContactSidebar
        v-if="selectedId && contactDrawer"
        :key="`drawer-${selectedId}`"
        :contact-id="selectedId"
        class="!w-full !border-l-0 !bg-transparent !p-0"
      />
    </Drawer>

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

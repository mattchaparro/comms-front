<script setup lang="ts">
// Escribirle a alguien que no ha escrito: buscarla por nombre o teléfono en
// el directorio (las clientas que publica la app, tengan o no conversación)
// o poner un número nuevo. Al elegir, la bandeja abre su hilo y, como no
// tiene ventana de 24 h, ofrece mandar una plantilla.
import { isAxiosError } from 'axios'
import { useMutation, useQuery } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { computed, ref, watch } from 'vue'

import type { DirectoryContact } from '@/types/chat'

import { addToDirectory, searchDirectory } from '../services/chatService'

const props = defineProps<{ apps: string[]; defaultApp: string | null }>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ open: [contact: DirectoryContact] }>()

const q = ref('')
const debounced = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => (debounced.value = value), 250)
})

const appId = ref<string | null>(null)
const error = ref<string | null>(null)
watch(visible, (open) => {
  if (!open) return
  q.value = ''
  debounced.value = ''
  error.value = null
  appId.value = props.defaultApp ?? (props.apps.length === 1 ? props.apps[0] : null)
})

const { data: results, isFetching } = useQuery({
  queryKey: computed(() => ['chat-directory', debounced.value, appId.value] as const),
  queryFn: () => searchDirectory(debounced.value, appId.value ?? undefined),
  enabled: computed(() => visible.value && debounced.value.trim().length >= 2),
})

// Lo escrito parece un celular: se ofrece escribirle aunque no esté.
const digits = computed(() => q.value.replace(/\D/g, ''))
const looksLikePhone = computed(() => digits.value.length >= 10 && /^[\d\s+()-]+$/.test(q.value.trim()))
const alreadyListed = computed(() =>
  (results.value ?? []).some((c) => c.phone.endsWith(digits.value.slice(-10))),
)

const addMutation = useMutation({
  mutationFn: () => addToDirectory({ app_id: appId.value as string, phone: q.value }),
  onSuccess: (contact) => choose(contact),
  onError: (e) => {
    error.value =
      isAxiosError<{ detail?: string }>(e) && typeof e.response?.data?.detail === 'string'
        ? e.response.data.detail
        : 'No pudimos agregar ese número.'
  },
})

function addNumber(): void {
  error.value = null
  if (!appId.value) {
    error.value = 'Elige la app desde la que le vas a escribir.'
    return
  }
  addMutation.mutate()
}

function choose(contact: DirectoryContact): void {
  visible.value = false
  emit('open', contact)
}

function pretty(phone: string): string {
  const m = phone.match(/^57(\d{3})(\d{3})(\d{4})$/)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : `+${phone}`
}
</script>

<template>
  <Dialog v-model:visible="visible" modal header="Nueva conversación" :draggable="false" class="w-full max-w-md">
    <div class="flex flex-col gap-3">
      <p class="text-sm text-slate-500">
        Busca a la clienta por nombre o teléfono, o escribe un número nuevo. Si no te ha escrito en
        las últimas 24 horas, la conversación se abre con una plantilla.
      </p>

      <Select
        v-if="apps.length > 1"
        v-model="appId"
        :options="apps"
        placeholder="App"
        show-clear
        fluid
      />

      <InputText v-model="q" placeholder="Nombre o celular…" autofocus fluid />
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div class="max-h-80 overflow-y-auto">
        <p v-if="isFetching && !results" class="py-3 text-sm text-slate-400">Buscando…</p>
        <button
          v-for="contact in results ?? []"
          :key="contact.contact_id"
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
          @click="choose(contact)"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-slate-800">{{ contact.name || 'Sin nombre' }}</span>
            <span class="block text-xs text-slate-500">{{ pretty(contact.phone) }}</span>
          </span>
          <span v-if="contact.has_conversation" class="shrink-0 text-[11px] text-teal-700">Ya ha escrito</span>
          <span v-else class="shrink-0 text-[11px] text-slate-400">Sin conversación</span>
        </button>
        <p
          v-if="debounced.trim().length >= 2 && !isFetching && !(results ?? []).length && !looksLikePhone"
          class="py-3 text-sm text-slate-400"
        >
          No hay nadie con ese nombre o número.
        </p>
      </div>

      <Button
        v-if="looksLikePhone && !alreadyListed"
        icon="pi pi-plus"
        :label="`Escribirle al ${q.trim()}`"
        severity="secondary"
        outlined
        :loading="addMutation.isPending.value"
        @click="addNumber"
      />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
/*
 * El archivo de un mensaje: audio, imagen, video o documento.
 *
 * Lo que mandó la clienta llega de Meta como un id: el servidor lo descarga
 * (GET …/messages/{id}/media) y aquí se pide con la sesión y se reproduce
 * desde un blob -- un <audio src> no puede mandar el token. Lo que salió de
 * aquí ya tiene un link público y se usa directo.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { ChatMessage } from '@/types/chat'

import { fetchInboundMedia } from '../services/chatService'

const props = defineProps<{ message: ChatMessage; contactId: string }>()

const kind = computed(() => props.message.payload.media_kind ?? props.message.message_type)
const publicUrl = computed(() => props.message.payload.media_url ?? null)
const blobUrl = ref<string | null>(null)
const loading = ref(false)
const failed = ref(false)

const src = computed(() => publicUrl.value ?? blobUrl.value)

async function load(): Promise<void> {
  if (publicUrl.value || blobUrl.value || loading.value || props.message.direction !== 'in') return
  loading.value = true
  failed.value = false
  try {
    blobUrl.value = URL.createObjectURL(await fetchInboundMedia(props.contactId, props.message.id))
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

// Audio, imagen y video se cargan solos: es lo que se quiere ver. El
// documento espera a que lo pidan (puede pesar y casi nunca se abre).
onMounted(() => {
  if (kind.value !== 'document') void load()
})

onBeforeUnmount(() => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
})

async function openDocument(): Promise<void> {
  await load()
  if (src.value) window.open(src.value, '_blank')
}
</script>

<template>
  <div class="mb-1">
    <p v-if="loading" class="text-xs text-slate-400"><i class="pi pi-spin pi-spinner mr-1" />Cargando…</p>
    <p v-else-if="failed" class="text-xs text-slate-500">
      <i class="pi pi-exclamation-circle mr-1" />No se pudo cargar el archivo.
      <button type="button" class="text-teal-700 underline" @click="load">Reintentar</button>
    </p>

    <template v-else-if="src">
      <audio v-if="kind === 'audio'" :src="src" controls preload="metadata" class="h-10 w-60 max-w-full" />
      <a v-else-if="kind === 'image' || kind === 'sticker'" :href="src" target="_blank">
        <img :src="src" alt="Imagen" class="max-h-64 max-w-full rounded-lg" />
      </a>
      <video v-else-if="kind === 'video'" :src="src" controls class="max-h-64 max-w-full rounded-lg" />
      <a v-else :href="src" target="_blank" class="text-teal-700 underline">
        <i class="pi pi-paperclip mr-1 text-xs" />Documento
      </a>
    </template>

    <button
      v-else-if="kind === 'document'"
      type="button"
      class="text-teal-700 underline"
      @click="openDocument"
    >
      <i class="pi pi-paperclip mr-1 text-xs" />Abrir documento
    </button>
  </div>
</template>

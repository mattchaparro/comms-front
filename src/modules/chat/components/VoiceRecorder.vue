<script setup lang="ts">
/*
 * Grabar una nota de voz y mandarla.
 *
 * El navegador graba en lo que sabe (webm en Chrome/Android, mp4 en
 * Safari/iPhone); el servidor lo convierte a ogg/opus, que es lo que WhatsApp
 * acepta como nota de voz (POST /v1/admin/media/voice).
 */
import Button from 'primevue/button'
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{ disabled?: boolean; sending?: boolean }>()
const emit = defineEmits<{ recorded: [file: File]; recording: [value: boolean] }>()

const recording = ref(false)
const seconds = ref(0)
const error = ref<string | null>(null)

let recorder: MediaRecorder | null = null
let stream: MediaStream | null = null
let chunks: Blob[] = []
let timer: ReturnType<typeof setInterval> | undefined
let cancelled = false

const clock = computed(
  () => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`,
)

function bestMime(): string {
  for (const mime of ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ''
}

function extensionFor(mime: string): string {
  if (mime.includes('ogg')) return '.ogg'
  if (mime.includes('mp4')) return '.m4a'
  return '.webm'
}

function cleanup(): void {
  clearInterval(timer)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  recorder = null
  recording.value = false
  emit('recording', false)
}

async function start(): Promise<void> {
  error.value = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    error.value = 'Permite el micrófono para grabar.'
    return
  }

  const mime = bestMime()
  recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  chunks = []
  cancelled = false
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recorder.onstop = () => {
    const type = recorder?.mimeType || mime || 'audio/webm'
    const blob = new Blob(chunks, { type })
    cleanup()
    if (!cancelled && blob.size > 0) {
      emit('recorded', new File([blob], `nota${extensionFor(type)}`, { type }))
    }
  }
  recorder.start()
  recording.value = true
  emit('recording', true)
  seconds.value = 0
  timer = setInterval(() => {
    seconds.value++
    // WhatsApp corta en 16 MB; a 32 kbps son horas, pero nadie manda más de 5 minutos.
    if (seconds.value >= 300) stop()
  }, 1000)
}

function stop(): void {
  recorder?.stop()
}

function cancel(): void {
  cancelled = true
  recorder?.stop()
}

onBeforeUnmount(() => {
  cancelled = true
  recorder?.state === 'recording' ? recorder.stop() : cleanup()
})
</script>

<template>
  <div v-if="recording" class="flex min-w-0 flex-1 items-center gap-2">
    <span class="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-sm text-red-700">
      <span class="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
      Grabando {{ clock }}
    </span>
    <Button icon="pi pi-trash" severity="secondary" text rounded aria-label="Cancelar" @click="cancel" />
    <Button icon="pi pi-send" rounded aria-label="Enviar nota de voz" @click="stop" />
  </div>
  <template v-else>
    <Button
      icon="pi pi-microphone"
      severity="secondary"
      text
      rounded
      class="shrink-0 sm:!border sm:!border-slate-300"
      :loading="props.sending"
      :disabled="props.disabled"
      title="Grabar una nota de voz"
      aria-label="Grabar nota de voz"
      @click="start"
    />
    <span v-if="error" class="text-xs text-red-600">{{ error }}</span>
  </template>
</template>

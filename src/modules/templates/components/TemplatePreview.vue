<script setup lang="ts">
// Vista previa de una plantilla como se ve en WhatsApp: burbuja con
// HEADER / BODY / FOOTER y los botones debajo. Reutilizada por el detalle
// de Plantillas, el panel del nodo `template` del builder y el simulador.
// `params` (opcional) reemplaza {{1}}, {{2}}... para previsualizar con
// valores reales.
import { computed } from 'vue'

const props = defineProps<{
  components: Record<string, unknown>[]
  params?: string[]
}>()

function find(type: string): Record<string, unknown> | undefined {
  return props.components.find((c) => String(c.type).toUpperCase() === type)
}

function fill(text: string): string {
  if (!props.params?.length) return text
  return text.replace(/\{\{(\d+)\}\}/g, (raw, n) => props.params![Number(n) - 1] || raw)
}

const header = computed(() => find('HEADER'))
const headerText = computed(() =>
  header.value && typeof header.value.text === 'string' ? fill(header.value.text) : null,
)
const headerFormat = computed(() =>
  header.value ? String(header.value.format ?? 'TEXT').toUpperCase() : null,
)
const body = computed(() => {
  const component = find('BODY')
  return typeof component?.text === 'string' ? fill(component.text) : ''
})
const footer = computed(() => {
  const component = find('FOOTER')
  return typeof component?.text === 'string' ? component.text : null
})
const buttons = computed(() => {
  const component = find('BUTTONS')
  return Array.isArray(component?.buttons)
    ? (component.buttons as Record<string, unknown>[]).map((b) => ({
        type: String(b.type ?? '').toUpperCase(),
        text: String(b.text ?? ''),
      }))
    : []
})

const MEDIA_HEADER_ICONS: Record<string, string> = {
  IMAGE: 'pi pi-image',
  VIDEO: 'pi pi-video',
  DOCUMENT: 'pi pi-paperclip',
  LOCATION: 'pi pi-map-marker',
}
</script>

<template>
  <div class="w-full max-w-sm">
    <div class="rounded-xl rounded-tl-sm bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div
        v-if="headerFormat && headerFormat !== 'TEXT'"
        class="mb-2 flex h-24 items-center justify-center rounded-lg bg-slate-100 text-slate-400"
      >
        <i :class="MEDIA_HEADER_ICONS[headerFormat] ?? 'pi pi-file'" class="text-2xl" />
      </div>
      <p v-else-if="headerText" class="mb-1 text-sm font-bold text-slate-900">{{ headerText }}</p>

      <p class="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{{ body }}</p>

      <p v-if="footer" class="mt-1.5 text-xs text-slate-400">{{ footer }}</p>
    </div>

    <div v-if="buttons.length" class="mt-1 flex flex-col gap-1">
      <div
        v-for="(button, index) in buttons"
        :key="index"
        class="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-sm font-medium text-teal-700 shadow-sm ring-1 ring-slate-200"
      >
        <i
          :class="
            button.type === 'URL'
              ? 'pi pi-external-link'
              : button.type === 'PHONE_NUMBER'
                ? 'pi pi-phone'
                : 'pi pi-reply'
          "
          class="text-xs"
        />
        {{ button.text }}
      </div>
    </div>
  </div>
</template>

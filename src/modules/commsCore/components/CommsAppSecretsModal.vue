<script setup lang="ts">
// comms-api solo devuelve api_key en la respuesta de creacion/regeneracion
// (nunca en list/get, ver core/schemas.py::CommsAppOut) - si se cierra este
// modal sin copiarla, no hay forma de volver a verla (habria que
// regenerarla, lo que invalida esta misma). Mismo patron que
// IaAppSecretsModal.vue.
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import { useClipboard } from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    apiKey: string | null
    title?: string
  }>(),
  { title: 'App creada' },
)
const modelValue = defineModel<boolean>({ required: true })

const { copy, copied } = useClipboard()
</script>

<template>
  <Dialog
    v-model:visible="modelValue"
    :header="props.title"
    modal
    :closable="false"
    :draggable="false"
    :pt="{ root: { class: 'w-full max-w-lg' } }"
  >
    <div v-if="props.apiKey" class="flex flex-col gap-4">
      <Message severity="warn" :closable="false">
        Copia esta API key ahora - nexolu-comms-api no la vuelve a mostrar. Si la pierdes, la unica
        opcion es regenerarla de nuevo (lo que invalida esta misma).
      </Message>

      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-slate-700">API key</span>
        <div class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <code class="flex-1 truncate text-sm">{{ props.apiKey }}</code>
          <Button icon="pi pi-copy" text size="small" aria-label="Copiar API key" @click="copy(props.apiKey!)" />
        </div>
      </div>

      <p v-if="copied" class="text-xs text-emerald-600">Copiado al portapapeles.</p>
    </div>

    <template #footer>
      <Button label="Ya la copie, cerrar" class="w-full" @click="modelValue = false" />
    </template>
  </Dialog>
</template>

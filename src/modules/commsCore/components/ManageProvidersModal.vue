<script setup lang="ts">
// Cada app tiene 2 proveedores independientes (a diferencia de IA Core, que
// solo tiene uno) - este modal los muestra juntos en vez de tener una ruta
// de detalle separada, para no meter un tercer nivel de nesting en el
// router por 2 cards.
import Dialog from 'primevue/dialog'
import { computed } from 'vue'

import BrevoCard from './BrevoCard.vue'
import MetaWhatsAppCard from './MetaWhatsAppCard.vue'

const props = defineProps<{ appId: string }>()
const modelValue = defineModel<boolean>({ required: true })

const header = computed(() => `Proveedores de "${props.appId}"`)
</script>

<template>
  <Dialog
    v-model:visible="modelValue"
    :header="header"
    modal
    :draggable="false"
    :pt="{ root: { class: 'w-full max-w-2xl' } }"
  >
    <div class="flex flex-col gap-4 sm:flex-row">
      <MetaWhatsAppCard :app-id="props.appId" />
      <BrevoCard :app-id="props.appId" />
    </div>
  </Dialog>
</template>

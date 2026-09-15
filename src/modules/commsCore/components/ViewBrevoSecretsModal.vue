<script setup lang="ts">
import Dialog from 'primevue/dialog'

import SecretValue from '@/ui/SecretValue.vue'
import type { BrevoSecrets } from '@/types/commsCore'

const props = defineProps<{ secrets: BrevoSecrets | null }>()
const modelValue = defineModel<boolean>({ required: true })
</script>

<template>
  <Dialog
    v-model:visible="modelValue"
    header="Credenciales de Brevo"
    modal
    :draggable="false"
    :pt="{ root: { class: 'w-full max-w-lg' } }"
  >
    <div v-if="props.secrets" class="flex flex-col gap-4">
      <SecretValue label="API key de Brevo" :value="props.secrets.brevo_api_key" />
    </div>
  </Dialog>
</template>

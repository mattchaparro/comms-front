<script setup lang="ts">
// Solo lectura, se puede abrir las veces que haga falta, valores ocultos
// por defecto con boton de revelar (SecretValue.vue) - mismo patron que
// ViewWompiSecretsModal.vue en el modulo de Payments.
import Dialog from 'primevue/dialog'

import SecretValue from '@/ui/SecretValue.vue'
import type { MetaWhatsAppSecrets } from '@/types/commsCore'

const props = defineProps<{ secrets: MetaWhatsAppSecrets | null }>()
const modelValue = defineModel<boolean>({ required: true })
</script>

<template>
  <Dialog
    v-model:visible="modelValue"
    header="Credenciales de Meta WhatsApp"
    modal
    :draggable="false"
    :pt="{ root: { class: 'w-full max-w-lg' } }"
  >
    <div v-if="props.secrets" class="flex flex-col gap-4">
      <SecretValue label="Access token" :value="props.secrets.access_token" />
      <SecretValue v-if="props.secrets.webhook_verify_token" label="Webhook verify token" :value="props.secrets.webhook_verify_token" />
      <SecretValue v-if="props.secrets.meta_app_secret" label="Meta app secret" :value="props.secrets.meta_app_secret" />
      <SecretValue v-if="props.secrets.callback_secret" label="Callback secret" :value="props.secrets.callback_secret" />
    </div>
  </Dialog>
</template>

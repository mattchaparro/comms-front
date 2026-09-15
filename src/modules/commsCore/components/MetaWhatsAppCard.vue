<script setup lang="ts">
// Mismo patron que WompiStatusCard.vue, pero sin dimension de ambiente
// (sandbox/production) - Meta WhatsApp Cloud API no tiene ese concepto para
// estas credenciales.
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { ref, toRef } from 'vue'

import { extractErrorMessage } from '@/services/http/errors'
import type { MetaWhatsAppSecrets } from '@/types/commsCore'

import ConfigureMetaWhatsAppModal from './ConfigureMetaWhatsAppModal.vue'
import ViewMetaWhatsAppSecretsModal from './ViewMetaWhatsAppSecretsModal.vue'
import { useMetaWhatsAppSecretsMutation, useMetaWhatsAppStatus } from '../composables/useMetaWhatsApp'

const props = defineProps<{ appId: string }>()

const { data: status } = useMetaWhatsAppStatus(toRef(props, 'appId'))
const showConfigure = ref(false)
const showSecrets = ref(false)
const viewedSecrets = ref<MetaWhatsAppSecrets | null>(null)

const secretsMutation = useMetaWhatsAppSecretsMutation()
const toast = useToast()

async function viewSecrets(): Promise<void> {
  try {
    viewedSecrets.value = await secretsMutation.mutateAsync(props.appId)
    showSecrets.value = true
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: extractErrorMessage(error, 'No pudimos obtener las credenciales.'),
      life: 4000,
    })
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
    <span class="text-sm font-semibold text-slate-700">Meta WhatsApp Cloud API</span>

    <div v-if="status?.configured" class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Tag severity="success" value="Configurado" />
        <span class="font-mono text-xs text-slate-500">{{ status.phone_number_id }}</span>
      </div>
      <Button
        label="Ver credenciales"
        icon="pi pi-eye"
        text
        size="small"
        :loading="secretsMutation.isPending.value"
        @click="viewSecrets"
      />
    </div>
    <div v-else class="flex items-center justify-between">
      <p class="text-sm text-slate-500">Sin credenciales de WhatsApp para esta app.</p>
      <Button label="Configurar" size="small" @click="showConfigure = true" />
    </div>

    <div v-if="status?.configured" class="border-t border-slate-100 pt-2">
      <Button label="Reconfigurar / rotar token" text size="small" @click="showConfigure = true" />
    </div>

    <ConfigureMetaWhatsAppModal v-model="showConfigure" :app-id="props.appId" />
    <ViewMetaWhatsAppSecretsModal v-model="showSecrets" :secrets="viewedSecrets" />
  </div>
</template>

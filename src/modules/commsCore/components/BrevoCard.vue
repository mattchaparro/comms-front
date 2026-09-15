<script setup lang="ts">
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { ref, toRef } from 'vue'

import { extractErrorMessage } from '@/services/http/errors'
import type { BrevoSecrets } from '@/types/commsCore'

import ConfigureBrevoModal from './ConfigureBrevoModal.vue'
import ViewBrevoSecretsModal from './ViewBrevoSecretsModal.vue'
import { useBrevoSecretsMutation, useBrevoStatus } from '../composables/useBrevo'

const props = defineProps<{ appId: string }>()

const { data: status } = useBrevoStatus(toRef(props, 'appId'))
const showConfigure = ref(false)
const showSecrets = ref(false)
const viewedSecrets = ref<BrevoSecrets | null>(null)

const secretsMutation = useBrevoSecretsMutation()
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
    <span class="text-sm font-semibold text-slate-700">Brevo (email)</span>

    <div v-if="status?.configured" class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Tag severity="success" value="Configurado" />
        <span class="font-mono text-xs text-slate-500">{{ status.from_email }}</span>
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
      <p class="text-sm text-slate-500">Sin API key propia - usa la cuenta de Brevo de la plataforma.</p>
      <Button label="Configurar" size="small" @click="showConfigure = true" />
    </div>

    <div v-if="status?.configured" class="border-t border-slate-100 pt-2">
      <Button label="Reconfigurar / rotar key" text size="small" @click="showConfigure = true" />
    </div>

    <ConfigureBrevoModal v-model="showConfigure" :app-id="props.appId" />
    <ViewBrevoSecretsModal v-model="showSecrets" :secrets="viewedSecrets" />
  </div>
</template>

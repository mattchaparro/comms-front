<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { ref } from 'vue'

import { extractErrorMessage } from '@/services/http/errors'
import { useAuthStore } from '@/stores/auth.store'
import type { CommsApp, CommsAppCreated } from '@/types/commsCore'

import CommsAppSecretsModal from './CommsAppSecretsModal.vue'
import CreateCommsAppModal from './CreateCommsAppModal.vue'
import ManageProvidersModal from './ManageProvidersModal.vue'
import { useCommsAppMutations } from '../composables/useCommsAppMutations'
import { useCommsApps } from '../composables/useCommsApps'

// Crear apps y rotar api_keys es solo-plataforma (el backend igual lo
// rechaza con 401; esto evita mostrarle a un cliente botones que fallan).
// Sus credenciales de proveedor si son suyas: "Proveedores" queda.
const auth = useAuthStore()
const { data: apps, isLoading } = useCommsApps()
const { regenerateKeyMutation } = useCommsAppMutations()
const confirm = useConfirm()
const toast = useToast()

const showCreateModal = ref(false)
const showSecretsModal = ref(false)
const revealedApiKey = ref<string | null>(null)
const secretsModalTitle = ref('App creada')

const showProvidersModal = ref(false)
const providersAppId = ref('')

function onAppCreated(app: CommsAppCreated): void {
  revealedApiKey.value = app.api_key
  secretsModalTitle.value = 'App creada'
  showSecretsModal.value = true
}

function manageProviders(app: CommsApp): void {
  providersAppId.value = app.app_id
  showProvidersModal.value = true
}

function confirmRegenerateKey(app: CommsApp): void {
  confirm.require({
    header: 'Regenerar API key',
    message: `La api_key actual de "${app.app_id}" deja de funcionar de inmediato - la app cliente que la usa hay que actualizarla con la nueva.`,
    icon: 'pi pi-refresh',
    acceptLabel: 'Regenerar',
    acceptProps: { severity: 'danger' },
    rejectLabel: 'Cancelar',
    accept: async () => {
      try {
        const result = await regenerateKeyMutation.mutateAsync(app.app_id)
        revealedApiKey.value = result.api_key
        secretsModalTitle.value = 'API key regenerada'
        showSecretsModal.value = true
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: extractErrorMessage(error, 'No pudimos regenerar la API key.'),
          life: 4000,
        })
      }
    },
  })
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <p class="text-sm text-slate-500">
        Apps registradas en nexolu-comms-api - cada una tiene su propia api_key y, opcionalmente, sus
        propias credenciales de WhatsApp/Brevo.
      </p>
      <Button v-if="auth.isPlatform" label="Nueva app" icon="pi pi-plus" @click="showCreateModal = true" />
    </div>

    <DataTable :value="apps ?? []" :loading="isLoading" data-key="id" striped-rows>
      <template #empty>
        <p class="py-6 text-center text-sm text-slate-500">Todavia no hay apps registradas.</p>
      </template>
      <Column field="app_id" header="app_id">
        <template #body="{ data }">
          <span class="font-mono text-sm">{{ data.app_id }}</span>
        </template>
      </Column>
      <Column field="name" header="Nombre" />
      <Column header="Proveedores">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Tag :severity="data.has_meta_whatsapp ? 'success' : 'secondary'" value="WhatsApp" />
            <Tag :severity="data.has_brevo ? 'success' : 'secondary'" value="Brevo" />
          </div>
        </template>
      </Column>
      <Column field="is_active" header="Estado">
        <template #body="{ data }">
          <Tag :severity="data.is_active ? 'success' : 'danger'" :value="data.is_active ? 'Activa' : 'Inactiva'" />
        </template>
      </Column>
      <Column header="Acciones">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button
              icon="pi pi-sliders-h"
              text
              size="small"
              severity="secondary"
              aria-label="Proveedores"
              @click="manageProviders(data)"
            />
            <Button
              v-if="auth.isPlatform"
              icon="pi pi-key"
              text
              size="small"
              severity="secondary"
              aria-label="Regenerar API key"
              @click="confirmRegenerateKey(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <CreateCommsAppModal v-model="showCreateModal" @created="onAppCreated" />
    <CommsAppSecretsModal v-model="showSecretsModal" :api-key="revealedApiKey" :title="secretsModalTitle" />
    <ManageProvidersModal v-model="showProvidersModal" :app-id="providersAppId" />
  </div>
</template>

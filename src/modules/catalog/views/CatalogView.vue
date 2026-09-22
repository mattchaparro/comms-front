<script setup lang="ts">
// Catálogo de WhatsApp: el espejo del estado de sync por producto. La
// fuente de verdad del producto es la app dueña (el POS manda sus items a
// POST /v1/catalog/sync); aquí se ve en qué quedó cada uno contra Meta,
// se re-verifican lotes pendientes y se crea/conecta el catálogo de una
// app o negocio.
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { computed, ref } from 'vue'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import { formatDateTime } from '@/utils/formatDateTime'

import { checkCatalogItems, fetchCatalogItems, setupCatalog } from '../services/catalogService'

const queryClient = useQueryClient()
const toast = useToast()

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))

const appFilter = ref<string | null>(null)
const { data: items, isLoading } = useQuery({
  queryKey: ['catalog-items', appFilter] as const,
  queryFn: () => fetchCatalogItems(appFilter.value ?? undefined),
})

// --- verificar lotes pendientes ---

const checkMutation = useMutation({
  mutationFn: (appId: string) => checkCatalogItems(appId),
  onSuccess: (result) => {
    queryClient.invalidateQueries({ queryKey: ['catalog-items'] })
    toast.add({
      severity: result.errors ? 'warn' : 'success',
      summary: `Verificado: ${result.synced} ok, ${result.errors} con error, ${result.still_pending} aún en proceso`,
      life: 6000,
    })
  },
  onError: (error) => {
    const detail =
      isAxiosError<{ detail?: string }>(error) && error.response ? error.response.data?.detail : undefined
    toast.add({ severity: 'error', summary: 'No se pudo verificar', detail, life: 6000 })
  },
})

function check(): void {
  const appId = appFilter.value ?? (appOptions.value.length === 1 ? appOptions.value[0] : null)
  if (!appId) {
    toast.add({ severity: 'warn', summary: 'Elige una app para verificar sus lotes', life: 5000 })
    return
  }
  checkMutation.mutate(appId)
}

// --- configurar catálogo ---

const dialogVisible = ref(false)
const formApp = ref<string | null>(null)
const formBusiness = ref('')
const formMode = ref<'connect' | 'create'>('connect')
const formCatalogId = ref('')
const formName = ref('')
const formMetaBusinessId = ref('')
const formError = ref<string | null>(null)

function openSetup(): void {
  formApp.value = appFilter.value ?? (appOptions.value.length === 1 ? appOptions.value[0] : null)
  formBusiness.value = ''
  formMode.value = 'connect'
  formCatalogId.value = ''
  formName.value = ''
  formMetaBusinessId.value = ''
  formError.value = null
  dialogVisible.value = true
}

const setupMutation = useMutation({
  mutationFn: () =>
    setupCatalog({
      app_id: formApp.value as string,
      business_id: formBusiness.value.trim() || undefined,
      ...(formMode.value === 'connect'
        ? { catalog_id: formCatalogId.value.trim() }
        : {
            name: formName.value.trim(),
            meta_business_id: formMetaBusinessId.value.trim() || undefined,
          }),
    }),
  onSuccess: (result) => {
    dialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: `Catálogo ${result.catalog_id} conectado a la WABA`,
      life: 6000,
    })
  },
  onError: (error) => {
    formError.value =
      isAxiosError<{ detail?: string }>(error) && error.response
        ? (error.response.data?.detail ?? 'No pudimos configurar el catálogo.')
        : 'No pudimos configurar el catálogo.'
  },
})

function saveSetup(): void {
  formError.value = null
  if (!formApp.value) {
    formError.value = 'Elige la app.'
    return
  }
  if (formMode.value === 'connect' && !formCatalogId.value.trim()) {
    formError.value = 'Pega el catalog_id existente.'
    return
  }
  if (formMode.value === 'create' && !formName.value.trim()) {
    formError.value = 'El catálogo nuevo necesita un nombre.'
    return
  }
  setupMutation.mutate()
}

const statusSeverity: Record<string, 'success' | 'danger' | 'info'> = {
  synced: 'success',
  error: 'danger',
  pending: 'info',
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:items-center">
      <div>
        <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Catálogo</h1>
        <p class="mt-1 text-sm text-slate-500">
          Estado de cada producto contra el catálogo de Meta. La fuente de verdad es la app dueña
          (los items llegan por <code>POST /v1/catalog/sync</code>); lo que no cambió no se
          re-envía.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          icon="pi pi-check-circle"
          label="Verificar lotes"
          severity="secondary"
          outlined
          :loading="checkMutation.isPending.value"
          @click="check"
        />
        <Button label="Configurar catálogo" icon="pi pi-cog" @click="openSetup" />
      </div>
    </div>

    <div class="mb-4">
      <Select
        v-model="appFilter"
        :options="appOptions"
        placeholder="Todas las apps"
        show-clear
        class="w-56"
      />
    </div>

    <DataTable :value="items ?? []" :loading="isLoading" size="small" striped-rows>
      <Column field="app_id" header="App" />
      <Column field="retailer_id" header="retailer_id" />
      <Column field="title" header="Producto" />
      <Column field="price" header="Precio" />
      <Column header="Disponibilidad">
        <template #body="{ data: row }">
          <Tag
            :value="row.availability"
            :severity="row.availability === 'in stock' ? 'success' : 'warn'"
          />
        </template>
      </Column>
      <Column header="Sync">
        <template #body="{ data: row }">
          <div class="flex items-center gap-2">
            <Tag :value="row.sync_status" :severity="statusSeverity[row.sync_status]" />
            <i v-if="row.last_error" class="pi pi-info-circle text-slate-400" :title="row.last_error" />
          </div>
        </template>
      </Column>
      <Column header="Último sync">
        <template #body="{ data: row }">
          {{ row.last_synced_at ? formatDateTime(row.last_synced_at) : '—' }}
        </template>
      </Column>
      <template #empty>
        <p class="py-6 text-center text-slate-500">
          Sin productos sincronizados. La app dueña los manda con
          <code>POST /v1/catalog/sync</code> cuando sus productos cambian.
        </p>
      </template>
    </DataTable>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      header="Configurar catálogo"
      :draggable="false"
      class="w-full max-w-md"
    >
      <div class="flex flex-col gap-4">
        <Message v-if="formError" severity="error" :closable="false">{{ formError }}</Message>
        <Message severity="info" :closable="false">
          Un solo catálogo por WABA (regla de Meta). Si el negocio nunca ha creado un catálogo, los
          Términos se aceptan creando el primero en Business Manager — paso manual único.
        </Message>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">App</label>
            <Select v-model="formApp" :options="appOptions" placeholder="App" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">
              Negocio <span class="font-normal text-slate-400">(opcional)</span>
            </label>
            <InputText v-model="formBusiness" placeholder="número propio" fluid />
          </div>
        </div>

        <SelectButton
          v-model="formMode"
          :options="[
            { label: 'Conectar uno existente', value: 'connect' },
            { label: 'Crear uno nuevo', value: 'create' },
          ]"
          option-label="label"
          option-value="value"
          :allow-empty="false"
        />

        <div v-if="formMode === 'connect'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">catalog_id</label>
          <InputText v-model="formCatalogId" placeholder="194836987003835" fluid />
        </div>

        <template v-else>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">Nombre</label>
            <InputText v-model="formName" placeholder="Catálogo Estación Polar" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">
              Meta Business ID
              <span class="font-normal text-slate-400">(si la credencial no lo tiene)</span>
            </label>
            <InputText v-model="formMetaBusinessId" fluid />
          </div>
        </template>

        <div class="flex gap-2 pt-2">
          <Button label="Cancelar" severity="secondary" outlined class="flex-1" @click="dialogVisible = false" />
          <Button
            label="Guardar"
            class="flex-[2]"
            :loading="setupMutation.isPending.value"
            @click="saveSetup"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>

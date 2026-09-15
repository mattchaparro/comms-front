<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { computed, ref } from 'vue'

import { NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES } from '@/types/commsCore'

import { useNotifications } from '../composables/useNotifications'
import { formatDateTime } from '@/utils/formatDateTime'

const appFilter = ref('')
const businessFilter = ref('')
const channelFilter = ref<string | null>(null)
const statusFilter = ref<string | null>(null)
const referenceFilter = ref('')

const filters = computed(() => ({
  app_id: appFilter.value || undefined,
  business_id: businessFilter.value || undefined,
  channel: (channelFilter.value ?? undefined) as never,
  status: (statusFilter.value ?? undefined) as never,
  reference: referenceFilter.value || undefined,
}))

const { data, isLoading, isFetching, refetch } = useNotifications(filters)

const statusSeverity: Record<string, 'success' | 'danger' | 'secondary'> = {
  sent: 'success',
  failed: 'danger',
  skipped: 'secondary',
}

</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500">App</label>
        <InputText v-model="appFilter" placeholder="pos, spa, ..." class="w-32 font-mono text-sm" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500">Negocio</label>
        <InputText v-model="businessFilter" placeholder="business_id" class="w-32 font-mono text-sm" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500">Canal</label>
        <Select v-model="channelFilter" :options="[...NOTIFICATION_CHANNELS]" placeholder="Todos" show-clear class="w-36" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500">Estado</label>
        <Select v-model="statusFilter" :options="[...NOTIFICATION_STATUSES]" placeholder="Todos" show-clear class="w-36" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500">Reference</label>
        <InputText v-model="referenceFilter" placeholder="low_stock_alert:..." class="w-56 font-mono text-sm" />
      </div>
      <Button
        icon="pi pi-refresh"
        text
        severity="secondary"
        :loading="isFetching && !isLoading"
        aria-label="Refrescar"
        @click="() => refetch()"
      />
      <span v-if="data" class="text-xs text-slate-400">{{ data.total }} en total</span>
    </div>

    <DataTable :value="data?.notifications ?? []" :loading="isLoading" data-key="id" striped-rows>
      <template #empty>
        <p class="py-6 text-center text-sm text-slate-500">No hay envios con estos filtros.</p>
      </template>
      <Column header="Creado">
        <template #body="{ data: row }">
          <span class="text-xs text-slate-500">{{ formatDateTime(row.created_at) }}</span>
        </template>
      </Column>
      <Column field="app_id" header="App">
        <template #body="{ data: row }">
          <span class="font-mono text-xs">{{ row.app_id }}</span>
        </template>
      </Column>
      <Column field="business_id" header="Negocio">
        <template #body="{ data: row }">
          <span class="font-mono text-xs">{{ row.business_id }}</span>
        </template>
      </Column>
      <Column field="channel" header="Canal" />
      <Column field="recipient" header="Destinatario" />
      <Column header="Estado">
        <template #body="{ data: row }">
          <Tag :severity="statusSeverity[row.status]" :value="row.status" :title="row.error ?? undefined" />
        </template>
      </Column>
      <Column header="Reference">
        <template #body="{ data: row }">
          <span class="font-mono text-xs text-slate-500">{{ row.reference ?? '—' }}</span>
        </template>
      </Column>
      <Column header="Error">
        <template #body="{ data: row }">
          <span class="text-xs text-slate-500">{{ row.error ?? '—' }}</span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

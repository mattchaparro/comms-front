<script setup lang="ts">
// Triage de eventos de webhook: que llego, que se entrego a cada app, que
// fallo y por que, y re-lanzar a mano lo que quedo `failed`/`dead`. La
// fila es la vida completa del evento (persistido antes del 200 a Meta,
// ver nexolu-comms-api/core/webhooks/forwarder.py) - un `order` en `dead`
// aca es una venta a punto de perderse, por eso este panel existe.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { computed, ref } from 'vue'

import { formatDateTime } from '@/utils/formatDateTime'
import { WEBHOOK_EVENT_TYPES, WEBHOOK_FORWARD_STATUSES } from '@/types/webhooks'
import type { WebhookEvent, WebhookEventDetail } from '@/types/webhooks'

import {
  fetchWebhookEvent,
  fetchWebhookEvents,
  retryWebhookEvent,
} from '../services/webhooksService'

const appFilter = ref('')
const statusFilter = ref<string | null>(null)
const typeFilter = ref<string | null>(null)

const filters = computed(() => ({
  app_id: appFilter.value || undefined,
  forward_status: (statusFilter.value ?? undefined) as never,
  event_type: typeFilter.value ?? undefined,
  limit: 50,
}))

const queryClient = useQueryClient()
const { data, isLoading, isFetching, refetch } = useQuery({
  queryKey: ['webhook-events', filters] as const,
  queryFn: () => fetchWebhookEvents(filters.value),
})

const toast = useToast()
const retryMutation = useMutation({
  mutationFn: retryWebhookEvent,
  onSuccess: (event) => {
    queryClient.invalidateQueries({ queryKey: ['webhook-events'] })
    toast.add({
      severity: event.forward_status === 'delivered' ? 'success' : 'warn',
      summary:
        event.forward_status === 'delivered'
          ? 'Evento entregado'
          : `El reintento quedó en '${event.forward_status}'`,
      detail: event.last_error ?? undefined,
      life: 5000,
    })
  },
  onError: () =>
    toast.add({ severity: 'error', summary: 'No se pudo re-lanzar el evento', life: 5000 }),
})

const detail = ref<WebhookEventDetail | null>(null)
const detailVisible = ref(false)

async function openDetail(event: WebhookEvent): Promise<void> {
  detail.value = await fetchWebhookEvent(event.id)
  detailVisible.value = true
}

function prettyPayload(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    return payload
  }
}

const statusSeverity: Record<string, 'success' | 'danger' | 'warn' | 'secondary' | 'info'> = {
  delivered: 'success',
  failed: 'warn',
  dead: 'danger',
  rejected: 'danger',
  pending: 'info',
  skipped: 'secondary',
}

// `delivered` seria fabricar un duplicado y `rejected` nunca tuvo firma
// valida - el backend los rechaza con 409, mejor ni ofrecer el boton.
function canRetry(event: WebhookEvent): boolean {
  return !['delivered', 'rejected'].includes(event.forward_status)
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:items-center">
      <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Webhooks</h1>
      <Button
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="isFetching"
        @click="() => refetch()"
      />
    </div>

    <div class="mb-4 flex flex-wrap gap-3">
      <InputText v-model="appFilter" placeholder="App" class="w-40" />
      <Select
        v-model="statusFilter"
        :options="[...WEBHOOK_FORWARD_STATUSES]"
        placeholder="Estado"
        show-clear
        class="w-44"
      />
      <Select
        v-model="typeFilter"
        :options="[...WEBHOOK_EVENT_TYPES]"
        placeholder="Tipo"
        show-clear
        class="w-44"
      />
      <span v-if="data" class="self-center text-sm text-slate-500">{{ data.total }} eventos</span>
    </div>

    <DataTable :value="data?.items ?? []" :loading="isLoading" size="small" striped-rows>
      <Column header="Recibido">
        <template #body="{ data: row }">{{ formatDateTime(row.received_at) }}</template>
      </Column>
      <Column field="app_id" header="App" />
      <Column header="Tipo">
        <template #body="{ data: row }">
          <Tag
            :value="row.event_type"
            :severity="row.event_type === 'order' ? 'warn' : 'secondary'"
          />
        </template>
      </Column>
      <Column field="phone_number_id" header="Número" />
      <Column header="Estado">
        <template #body="{ data: row }">
          <Tag :value="row.forward_status" :severity="statusSeverity[row.forward_status]" />
        </template>
      </Column>
      <Column field="attempts" header="Intentos" />
      <Column header="Último error">
        <template #body="{ data: row }">
          <span class="block max-w-64 truncate text-sm text-slate-500" :title="row.last_error">
            {{ row.last_error ?? '—' }}
          </span>
        </template>
      </Column>
      <Column header="">
        <template #body="{ data: row }">
          <div class="flex justify-end gap-1">
            <Button
              icon="pi pi-eye"
              text
              severity="secondary"
              title="Ver payload"
              @click="openDetail(row)"
            />
            <Button
              v-if="canRetry(row)"
              icon="pi pi-replay"
              text
              title="Re-lanzar ahora"
              :loading="retryMutation.isPending.value"
              @click="retryMutation.mutate(row.id)"
            />
          </div>
        </template>
      </Column>
      <template #empty>
        <p class="py-6 text-center text-slate-500">Sin eventos con estos filtros.</p>
      </template>
    </DataTable>

    <Dialog
      v-model:visible="detailVisible"
      modal
      header="Payload del evento"
      class="w-full max-w-3xl"
    >
      <div v-if="detail" class="space-y-3">
        <div class="flex flex-wrap gap-2 text-sm text-slate-600">
          <Tag :value="detail.forward_status" :severity="statusSeverity[detail.forward_status]" />
          <span>{{ detail.app_id }} · {{ detail.event_type }}</span>
          <span v-if="detail.signature_valid === false" class="font-medium text-red-600">
            firma inválida
          </span>
        </div>
        <p v-if="detail.last_error" class="text-sm text-red-600">{{ detail.last_error }}</p>
        <pre
          class="max-h-96 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100"
          >{{ prettyPayload(detail.payload) }}</pre
        >
      </div>
    </Dialog>
  </div>
</template>

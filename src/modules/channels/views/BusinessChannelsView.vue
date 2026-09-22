<script setup lang="ts">
// Numeros propios por negocio (Embedded Signup): quien esta conectado, con
// que WABA/numero, y desconexion manual. CONECTAR no vive aca a proposito:
// el signup lo inicia el dueño del negocio desde el panel de SU app
// (POS/Spa), porque es Meta quien le pide login y OTP a el - este panel
// opera lo ya conectado.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { computed, ref } from 'vue'

import { formatDateTime } from '@/utils/formatDateTime'
import type { BusinessChannel } from '@/types/channels'

import { disconnectBusinessChannel, fetchBusinessChannels } from '../services/channelsService'

const appFilter = ref('')
const filterKey = computed(() => appFilter.value || undefined)

const queryClient = useQueryClient()
const { data, isLoading, isFetching, refetch } = useQuery({
  queryKey: ['business-channels', filterKey] as const,
  queryFn: () => fetchBusinessChannels(filterKey.value),
})

const toast = useToast()
const confirm = useConfirm()

const disconnectMutation = useMutation({
  mutationFn: disconnectBusinessChannel,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['business-channels'] })
    toast.add({
      severity: 'success',
      summary: 'Canal desconectado',
      detail: 'Los envíos de ese negocio vuelven al número compartido de su app.',
      life: 5000,
    })
  },
  onError: () =>
    toast.add({ severity: 'error', summary: 'No se pudo desconectar el canal', life: 5000 }),
})

function confirmDisconnect(channel: BusinessChannel): void {
  confirm.require({
    header: 'Desconectar canal',
    message:
      `El negocio ${channel.business_id} (${channel.display_phone_number ?? channel.phone_number_id}) ` +
      'dejará de enviar por su número propio. Reconectar requiere repetir el "Conectar WhatsApp" desde su app.',
    acceptLabel: 'Desconectar',
    acceptProps: { severity: 'danger' },
    rejectLabel: 'Cancelar',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => disconnectMutation.mutate(channel.id),
  })
}

const statusSeverity: Record<string, 'success' | 'danger' | 'info'> = {
  active: 'success',
  disconnected: 'danger',
  pending: 'info',
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:items-center">
      <div>
        <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Negocios / Canales</h1>
        <p class="mt-1 text-sm text-slate-500">
          Números propios conectados por Embedded Signup. Un negocio sin canal propio envía por el
          número compartido de su app.
        </p>
      </div>
      <Button
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="isFetching"
        @click="() => refetch()"
      />
    </div>

    <div class="mb-4">
      <InputText v-model="appFilter" placeholder="Filtrar por app" class="w-48" />
    </div>

    <DataTable :value="data ?? []" :loading="isLoading" size="small" striped-rows>
      <Column field="app_id" header="App" />
      <Column field="business_id" header="Negocio" />
      <Column header="Número">
        <template #body="{ data: row }">
          {{ row.display_phone_number ?? row.phone_number_id }}
        </template>
      </Column>
      <Column field="waba_id" header="WABA" />
      <Column header="Estado">
        <template #body="{ data: row }">
          <div class="flex items-center gap-2">
            <Tag :value="row.status" :severity="statusSeverity[row.status]" />
            <i
              v-if="row.last_error"
              class="pi pi-info-circle text-slate-400"
              :title="row.last_error"
            />
          </div>
        </template>
      </Column>
      <Column header="Conectado">
        <template #body="{ data: row }">
          {{ row.connected_at ? formatDateTime(row.connected_at) : '—' }}
        </template>
      </Column>
      <Column header="">
        <template #body="{ data: row }">
          <div class="flex justify-end">
            <Button
              v-if="row.status === 'active'"
              icon="pi pi-power-off"
              text
              severity="danger"
              title="Desconectar"
              @click="confirmDisconnect(row)"
            />
          </div>
        </template>
      </Column>
      <template #empty>
        <p class="py-6 text-center text-slate-500">
          Todavía no hay negocios con número propio. El primero llega cuando una app corra su
          "Conectar WhatsApp" (Embedded Signup).
        </p>
      </template>
    </DataTable>
  </div>
</template>

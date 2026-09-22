<script setup lang="ts">
// Gasto y volumen de los ultimos 30 dias, por app (GET /v1/platform/usage).
// Deliberadamente simple: el detalle fino ya vive en Registros (log de
// envios) y Webhooks (entrantes) - esto es el vistazo de "¿como va el
// canal?" al abrir el panel.
import { useQuery } from '@tanstack/vue-query'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import { computed } from 'vue'

import { httpClient } from '@/services/http/client'
import { useAuthStore } from '@/stores/auth.store'

interface UsageBreakdown {
  key: string
  message_count: number
  cost_usd: number
}

interface PlatformUsage {
  date_from: string
  date_to: string
  breakdown: UsageBreakdown[]
}

const auth = useAuthStore()

const { data, isLoading } = useQuery({
  queryKey: ['platform-usage'] as const,
  queryFn: async () => {
    const { data: usage } = await httpClient.get<PlatformUsage>('/v1/platform/usage')
    return usage
  },
})

const totals = computed(() => {
  const breakdown = data.value?.breakdown ?? []
  return {
    messages: breakdown.reduce((sum, row) => sum + row.message_count, 0),
    cost: breakdown.reduce((sum, row) => sum + row.cost_usd, 0),
    apps: breakdown.length,
  }
})

const usd = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4,
})
</script>

<template>
  <div>
    <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Hola, {{ auth.user?.full_name }}</h1>
    <p class="mt-1 text-sm text-slate-500">
      Actividad de los últimos 30 días
      <template v-if="data"> ({{ data.date_from }} → {{ data.date_to }})</template>
    </p>

    <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <p class="text-sm text-slate-500">Mensajes enviados</p>
        <p class="mt-1 text-3xl font-bold text-slate-900">{{ totals.messages }}</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <p class="text-sm text-slate-500">Costo estimado</p>
        <p class="mt-1 text-3xl font-bold text-slate-900">{{ usd.format(totals.cost) }}</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <p class="text-sm text-slate-500">Apps con actividad</p>
        <p class="mt-1 text-3xl font-bold text-slate-900">{{ totals.apps }}</p>
      </div>
    </div>

    <div class="mt-8">
      <h2 class="mb-3 text-lg font-semibold text-slate-900">Por app</h2>
      <DataTable :value="data?.breakdown ?? []" :loading="isLoading" size="small" striped-rows>
        <Column field="key" header="App" />
        <Column field="message_count" header="Mensajes" />
        <Column header="Costo (USD)">
          <template #body="{ data: row }">{{ usd.format(row.cost_usd) }}</template>
        </Column>
        <template #empty>
          <p class="py-6 text-center text-slate-500">Sin envíos en los últimos 30 días.</p>
        </template>
      </DataTable>
    </div>
  </div>
</template>

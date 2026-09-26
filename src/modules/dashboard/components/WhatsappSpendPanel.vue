<script setup lang="ts">
// Lo que Meta cobra de verdad por WhatsApp, por app y mes
// (GET /v1/admin/whatsapp-spend, que lee pricing_analytics de cada WABA).
// Es la cifra que se paga -- el "costo estimado" de arriba es el de
// Connect al enviar, sin saber qué entregó Meta ni qué salió gratis.
import { useQueries, useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import { httpClient } from '@/services/http/client'

interface SpendCategory {
  category: string
  type: string
  volume: number
  cost: number
}

interface Spend {
  month: string
  currency: string
  total: number
  total_usd: number | null
  volume: number
  by_category: SpendCategory[]
}

function monthOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const month = ref(monthOf(new Date()))
const isCurrent = computed(() => month.value === monthOf(new Date()))

function shift(delta: number): void {
  const [y, m] = month.value.split('-').map(Number)
  month.value = monthOf(new Date(y, m - 1 + delta, 1))
}

const monthLabel = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  const text = new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  return text.charAt(0).toUpperCase() + text.slice(1)
})

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const whatsappApps = computed(() => apps.value ?? [])

const results = useQueries({
  queries: computed(() =>
    whatsappApps.value.map((app) => ({
      queryKey: ['whatsapp-spend', app.app_id, month.value] as const,
      queryFn: async () =>
        (await httpClient.get<Spend>('/v1/admin/whatsapp-spend', { params: { app_id: app.app_id, month: month.value } }))
          .data,
      retry: false,
    })),
  ),
})

const rows = computed(() =>
  whatsappApps.value
    .map((app, i) => ({ app: app.app_id, name: app.name, query: results.value[i] }))
    // Sin WABA configurada o sin permiso en Meta: no se muestra.
    .filter((r) => r.query?.data),
)

const loading = computed(() => results.value.some((r) => r.isLoading))

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(value)
}

const LABELS: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticación',
  SERVICE: 'Atención (gratis)',
}
</script>

<template>
  <div class="mt-8">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold text-slate-900">Gasto real de WhatsApp (Meta)</h2>
      <div class="flex items-center gap-2 text-sm">
        <button type="button" class="rounded-md border border-slate-200 px-2 py-1" aria-label="Mes anterior" @click="shift(-1)">
          ‹
        </button>
        <span class="min-w-32 text-center font-medium text-slate-700">{{ monthLabel }}</span>
        <button
          type="button"
          class="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
          aria-label="Mes siguiente"
          :disabled="isCurrent"
          @click="shift(1)"
        >
          ›
        </button>
      </div>
    </div>

    <p v-if="loading && !rows.length" class="text-sm text-slate-500">Consultando a Meta…</p>
    <p v-else-if="!rows.length" class="text-sm text-slate-500">Ninguna app con cuenta de WhatsApp que Meta reporte.</p>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div v-for="row in rows" :key="row.app" class="rounded-xl border border-slate-200 bg-white p-5">
        <p class="text-sm text-slate-500">{{ row.name || row.app }}</p>
        <p class="mt-1 text-2xl font-bold text-slate-900">
          {{ money(row.query.data!.total, row.query.data!.currency) }}
        </p>
        <p v-if="row.query.data!.currency !== 'USD' && row.query.data!.total_usd !== null" class="text-xs text-slate-500">
          ≈ {{ money(row.query.data!.total_usd!, 'USD') }} · {{ row.query.data!.volume }} mensajes
        </p>
        <ul class="mt-3 space-y-1 text-sm">
          <li v-for="c in row.query.data!.by_category" :key="c.category + c.type" class="flex justify-between gap-2">
            <span class="text-slate-600">{{ LABELS[c.category] ?? c.category }} · {{ c.volume }}</span>
            <span class="font-medium text-slate-800">{{ c.cost > 0 ? money(c.cost, row.query.data!.currency) : 'Gratis' }}</span>
          </li>
        </ul>
      </div>
    </div>
    <p class="mt-2 text-xs text-slate-400">Datos de Meta (pricing_analytics); tardan unas horas y se refrescan cada hora.</p>
  </div>
</template>

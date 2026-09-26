<script setup lang="ts">
// Difusiones: una plantilla aprobada a un publico, ahora o a una hora.
// El publico es un criterio (ultima visita, visitas, etiquetas) que se
// evalua AL ENVIAR sobre los datos que la app publica de sus clientes; una
// plantilla de marketing solo le llega a quien acepta promociones (lo
// impone el backend, ver core/broadcasts.py en nexolu-comms-api).
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { computed, ref, watch } from 'vue'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import TemplatePreview from '@/modules/templates/components/TemplatePreview.vue'
import { fetchTemplates } from '@/modules/templates/services/templatesService'
import type { Broadcast, BroadcastAudience, BroadcastPayload, BroadcastStatus } from '@/types/broadcasts'
import { formatDateTime } from '@/utils/formatDateTime'

import {
  cancelBroadcast,
  createBroadcast,
  deleteBroadcast,
  fetchBroadcastRecipients,
  fetchBroadcastReport,
  fetchBroadcasts,
  previewBroadcast,
  updateBroadcast,
} from '../services/broadcastsService'

const queryClient = useQueryClient()
const toast = useToast()
const confirm = useConfirm()

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))

const appFilter = ref<string | null>(null)
const { data: broadcasts, isLoading } = useQuery({
  queryKey: ['broadcasts', appFilter] as const,
  queryFn: () => fetchBroadcasts(appFilter.value ?? undefined),
  // Mientras algo esta saliendo, el estado cambia solo.
  refetchInterval: (query) =>
    (query.state.data ?? []).some((b) => b.status === 'sending') ? 5000 : 60000,
})

const STATUS: Record<BroadcastStatus, { label: string; severity: 'success' | 'info' | 'warn' | 'secondary' | 'danger' }> = {
  draft: { label: 'Borrador', severity: 'secondary' },
  scheduled: { label: 'Programada', severity: 'info' },
  sending: { label: 'Enviando', severity: 'warn' },
  sent: { label: 'Enviada', severity: 'success' },
  cancelled: { label: 'Cancelada', severity: 'danger' },
}

const upcoming = computed(() =>
  (broadcasts.value ?? [])
    .filter((b) => b.status === 'scheduled' || b.status === 'sending')
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')),
)
const others = computed(() =>
  (broadcasts.value ?? []).filter((b) => b.status !== 'scheduled' && b.status !== 'sending'),
)

function errorDetail(error: unknown, fallback: string): string {
  return isAxiosError<{ detail?: unknown }>(error) && typeof error.response?.data?.detail === 'string'
    ? error.response.data.detail
    : fallback
}

// --- hora: el panel habla en hora de Bogota; el backend en UTC ---

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const utc = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`
  const bogota = new Date(new Date(utc).getTime() - 5 * 3600 * 1000)
  return bogota.toISOString().slice(0, 16)
}

function fromLocalInput(value: string): string | null {
  return value ? `${value}:00-05:00` : null
}

// --- formulario ---

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const form = ref({
  app_id: null as string | null,
  business_id: '',
  name: '',
  template_key: null as string | null,
  params: [] as string[],
  when: '',
  audience: {} as BroadcastAudience,
})
const formError = ref<string | null>(null)

const { data: templates } = useQuery({
  queryKey: ['whatsapp-templates', computed(() => form.value.app_id)] as const,
  queryFn: () => fetchTemplates(form.value.app_id ?? undefined),
  enabled: computed(() => !!form.value.app_id),
})
const approved = computed(() => (templates.value ?? []).filter((t) => t.status === 'APPROVED'))
const templateOptions = computed(() =>
  approved.value.map((t) => ({
    key: `${t.name}|${t.language}`,
    label: `${t.name} · ${t.language} · ${t.category === 'MARKETING' ? 'Marketing' : t.category === 'UTILITY' ? 'Utilidad' : t.category}`,
  })),
)
const template = computed(() =>
  approved.value.find((t) => `${t.name}|${t.language}` === form.value.template_key) ?? null,
)
const variableCount = computed(() => {
  const body = template.value?.components.find((c) => String(c.type).toUpperCase() === 'BODY')
  const text = typeof body?.text === 'string' ? body.text : ''
  const numbers = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
  return numbers.length ? Math.max(...numbers) : 0
})
watch(variableCount, (n) => {
  form.value.params = Array.from({ length: n }, (_, i) => form.value.params[i] ?? '')
})

// Lo que veria una clienta llamada Ana (para revisar como queda).
function sampleParam(raw: string): string {
  return raw
    .replace(/\{nombre(?:\|([^}]*))?\}/g, 'Ana')
    .replace(/\s+,/g, ',')
    .trim()
}
const sampleParams = computed(() => form.value.params.map(sampleParam))

function openCreate(): void {
  editingId.value = null
  form.value = {
    app_id: appFilter.value ?? (appOptions.value.length === 1 ? appOptions.value[0] : null),
    business_id: '',
    name: '',
    template_key: null,
    params: [],
    when: '',
    audience: {},
  }
  formError.value = null
  preview.value = null
  dialogVisible.value = true
}

function openEdit(row: Broadcast): void {
  editingId.value = row.id
  form.value = {
    app_id: row.app_id,
    business_id: row.business_id,
    name: row.name,
    template_key: `${row.template_name}|${row.template_language}`,
    params: [...row.template_params],
    when: toLocalInput(row.scheduled_at),
    audience: { ...row.audience },
  }
  formError.value = null
  preview.value = null
  dialogVisible.value = true
}

function payload(schedule: boolean): BroadcastPayload {
  const [name, language] = (form.value.template_key ?? '|').split('|')
  const audience = Object.fromEntries(
    Object.entries(form.value.audience).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ) as BroadcastAudience
  return {
    app_id: form.value.app_id as string,
    business_id: form.value.business_id.trim(),
    name: form.value.name.trim(),
    template_name: name,
    template_language: language || 'es',
    template_params: form.value.params,
    audience,
    scheduled_at: schedule ? fromLocalInput(form.value.when) : null,
  }
}

const previewMutation = useMutation({
  mutationFn: () => previewBroadcast(payload(false)),
  onSuccess: (data) => (preview.value = data),
  onError: (error) => (formError.value = errorDetail(error, 'No pudimos calcular el público.')),
})
const preview = ref<Awaited<ReturnType<typeof previewBroadcast>> | null>(null)
watch(
  () => [form.value.app_id, form.value.business_id, form.value.template_key, JSON.stringify(form.value.audience)],
  () => (preview.value = null),
)

const saveMutation = useMutation({
  mutationFn: (schedule: boolean) =>
    editingId.value ? updateBroadcast(editingId.value, payload(schedule)) : createBroadcast(payload(schedule)),
  onSuccess: (row) => {
    queryClient.invalidateQueries({ queryKey: ['broadcasts'] })
    dialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: row.status === 'scheduled' ? 'Difusión programada' : 'Borrador guardado',
      detail: row.scheduled_at ? `Sale el ${formatDateTime(row.scheduled_at)}` : undefined,
      life: 5000,
    })
  },
  onError: (error) => (formError.value = errorDetail(error, 'No pudimos guardar la difusión.')),
})

function validate(): boolean {
  formError.value = null
  if (!form.value.app_id) formError.value = 'Elige la app.'
  else if (!form.value.name.trim()) formError.value = 'Ponle un nombre para reconocerla.'
  else if (!template.value) formError.value = 'Elige una plantilla aprobada.'
  else if (form.value.params.some((p) => !p.trim())) formError.value = 'Llena todas las variables de la plantilla.'
  return formError.value === null
}

function saveDraft(): void {
  if (validate()) saveMutation.mutate(false)
}

function schedule(now: boolean): void {
  if (!validate()) return
  if (now) {
    form.value.when = toLocalInput(new Date().toISOString())
  } else if (!form.value.when) {
    formError.value = 'Elige el día y la hora.'
    return
  }
  const count = preview.value?.count
  confirm.require({
    header: now ? 'Enviar ahora' : 'Programar difusión',
    message:
      (count !== undefined ? `Le llegará a ${count} persona(s). ` : '') +
      (now ? 'Sale en menos de un minuto.' : `Sale el ${form.value.when.replace('T', ' a las ')}.`) +
      ' Puedes cancelarla mientras no haya salido.',
    acceptLabel: now ? 'Enviar' : 'Programar',
    rejectLabel: 'Volver',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => saveMutation.mutate(true),
  })
}

// --- cancelar / borrar ---

const cancelMutation = useMutation({
  mutationFn: cancelBroadcast,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['broadcasts'] })
    toast.add({ severity: 'success', summary: 'Difusión cancelada', life: 4000 })
  },
  onError: (error) =>
    toast.add({ severity: 'error', summary: errorDetail(error, 'No se pudo cancelar'), life: 5000 }),
})

function confirmCancel(row: Broadcast): void {
  confirm.require({
    header: 'Cancelar difusión',
    message: `"${row.name}" no saldrá. Queda en la lista como cancelada.`,
    acceptLabel: 'Cancelar difusión',
    acceptProps: { severity: 'danger' },
    rejectLabel: 'Volver',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => cancelMutation.mutate(row.id),
  })
}

const deleteMutation = useMutation({
  mutationFn: deleteBroadcast,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['broadcasts'] }),
})

// --- reporte ---

const reportId = ref<string | null>(null)
const { data: report, isFetching: reportLoading } = useQuery({
  queryKey: ['broadcast-report', reportId] as const,
  queryFn: () => fetchBroadcastReport(reportId.value as string),
  enabled: computed(() => !!reportId.value),
  refetchInterval: 30000,
})
const { data: recipients } = useQuery({
  queryKey: ['broadcast-recipients', reportId] as const,
  queryFn: () => fetchBroadcastRecipients(reportId.value as string),
  enabled: computed(() => !!reportId.value),
})
const failedRecipients = computed(() => (recipients.value ?? []).filter((r) => r.status === 'failed'))

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : '—'
}

function audienceSummary(a: BroadcastAudience): string {
  const parts: string[] = []
  if (a.last_visit_from) parts.push(`vino desde ${a.last_visit_from}`)
  if (a.last_visit_to) parts.push(`vino hasta ${a.last_visit_to}`)
  if (a.no_visit_since) parts.push(`no viene desde ${a.no_visit_since}`)
  if (a.visits_min != null) parts.push(`≥ ${a.visits_min} visitas`)
  if (a.visits_max != null) parts.push(`≤ ${a.visits_max} visitas`)
  if (a.attended_by) parts.push(`atendida por ${a.attended_by}`)
  if (a.tags_any?.length) parts.push(`con ${a.tags_any.join(', ')}`)
  if (a.tags_none?.length) parts.push(`sin ${a.tags_none.join(', ')}`)
  return parts.length ? parts.join(' · ') : 'Todos los contactos'
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:items-center">
      <div>
        <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Difusiones</h1>
        <p class="mt-1 text-sm text-slate-500">
          Una plantilla aprobada a un grupo de clientes, ahora o a la hora que elijas. Las de
          marketing solo le llegan a quien acepta promociones.
        </p>
      </div>
      <Button label="Nueva difusión" icon="pi pi-plus" @click="openCreate" />
    </div>

    <div class="mb-4">
      <Select v-model="appFilter" :options="appOptions" placeholder="Todas las apps" show-clear class="w-56" />
    </div>

    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Próximas</h2>
    <div v-if="upcoming.length" class="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="row in upcoming"
        :key="row.id"
        class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate font-semibold text-slate-900">{{ row.name }}</p>
            <p class="truncate text-xs text-slate-500">{{ row.template_name }} · {{ row.app_id }}</p>
          </div>
          <Tag :value="STATUS[row.status].label" :severity="STATUS[row.status].severity" />
        </div>
        <p class="text-sm text-slate-700">
          <i class="pi pi-clock mr-1 text-slate-400" />
          {{ row.scheduled_at ? formatDateTime(row.scheduled_at) : '—' }}
        </p>
        <p class="text-xs text-slate-500">{{ audienceSummary(row.audience) }}</p>
        <div class="mt-auto flex gap-2 pt-1">
          <template v-if="row.status === 'scheduled'">
            <Button label="Editar" size="small" severity="secondary" outlined @click="openEdit(row)" />
            <Button label="Cancelar" size="small" severity="danger" text @click="confirmCancel(row)" />
          </template>
          <Button v-else label="Ver avance" size="small" severity="secondary" outlined @click="reportId = row.id" />
        </div>
      </div>
    </div>
    <p v-else class="mb-6 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
      No hay difusiones programadas.
    </p>

    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Enviadas y borradores</h2>
    <DataTable
      :value="others"
      :loading="isLoading"
      size="small"
      striped-rows
      :row-class="() => 'cursor-pointer'"
      @row-click="($event.data as Broadcast).status === 'sent' ? (reportId = ($event.data as Broadcast).id) : ($event.data as Broadcast).status === 'draft' ? openEdit($event.data as Broadcast) : null"
    >
      <Column field="name" header="Nombre" />
      <Column field="template_name" header="Plantilla" />
      <Column header="Estado">
        <template #body="{ data: row }">
          <Tag :value="STATUS[row.status as BroadcastStatus].label" :severity="STATUS[row.status as BroadcastStatus].severity" />
        </template>
      </Column>
      <Column header="Salió">
        <template #body="{ data: row }">{{ row.sent_at ? formatDateTime(row.sent_at) : '—' }}</template>
      </Column>
      <Column header="Destinatarios">
        <template #body="{ data: row }">{{ row.status === 'sent' ? row.recipients : '—' }}</template>
      </Column>
      <Column header="">
        <template #body="{ data: row }">
          <div class="flex justify-end gap-1">
            <Button v-if="row.status === 'sent'" icon="pi pi-chart-bar" text severity="secondary" title="Reporte" @click.stop="reportId = row.id" />
            <Button
              v-if="row.status === 'draft' || row.status === 'cancelled'"
              icon="pi pi-trash"
              text
              severity="danger"
              title="Borrar"
              @click.stop="deleteMutation.mutate(row.id)"
            />
          </div>
        </template>
      </Column>
      <template #empty>
        <p class="py-6 text-center text-slate-500">Todavía no hay difusiones.</p>
      </template>
    </DataTable>

    <!-- Crear / editar -->
    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="editingId ? 'Editar difusión' : 'Nueva difusión'"
      :draggable="false"
      class="w-full max-w-4xl"
    >
      <div class="grid gap-6 md:grid-cols-[1fr_280px]">
        <div class="flex flex-col gap-4">
          <Message v-if="formError" severity="error" :closable="false">{{ formError }}</Message>

          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700">App</label>
              <Select v-model="form.app_id" :options="appOptions" placeholder="App" fluid :disabled="!!editingId" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700">
                Negocio <span class="font-normal text-slate-400">(id, opcional)</span>
              </label>
              <InputText v-model="form.business_id" placeholder="Ej: 1" fluid />
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">Nombre</label>
            <InputText v-model="form.name" placeholder="Te extrañamos · octubre" fluid />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">Plantilla</label>
            <Select
              v-model="form.template_key"
              :options="templateOptions"
              option-label="label"
              option-value="key"
              placeholder="Solo aparecen las aprobadas"
              filter
              fluid
            />
          </div>

          <div v-if="form.params.length" class="flex flex-col gap-2">
            <label class="text-sm font-medium text-slate-700">Variables</label>
            <div v-for="(_, i) in form.params" :key="i" class="flex items-center gap-2">
              <span class="w-10 shrink-0 font-mono text-xs text-slate-400" v-text="`{{${i + 1}}}`" />
              <InputText v-model="form.params[i]" fluid placeholder="Hola {nombre}" />
            </div>
            <p class="text-xs text-slate-400">
              <code>{nombre}</code> se cambia por el nombre de cada persona. Si su nombre no sirve para
              saludar (un punto, un emoji) queda vacío; <code>{nombre|hermosa}</code> usa “hermosa” en
              ese caso.
            </p>
          </div>

          <fieldset class="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
            <legend class="px-1 text-sm font-medium text-slate-700">¿A quién?</legend>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500">Vino desde</label>
                <input v-model="form.audience.last_visit_from" type="date" class="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500">Vino hasta</label>
                <input v-model="form.audience.last_visit_to" type="date" class="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500">No viene desde</label>
                <input v-model="form.audience.no_visit_since" type="date" class="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500">Atendida por</label>
                <InputText v-model="form.audience.attended_by" size="small" placeholder="Nombre" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500">Mínimo de visitas</label>
                <InputNumber v-model="form.audience.visits_min" size="small" :min="0" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500">Máximo de visitas</label>
                <InputNumber v-model="form.audience.visits_max" size="small" :min="0" />
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <Button
                label="¿A cuántas le llega?"
                icon="pi pi-users"
                size="small"
                severity="secondary"
                outlined
                :loading="previewMutation.isPending.value"
                :disabled="!form.app_id || !template"
                @click="previewMutation.mutate()"
              />
              <span v-if="preview" class="text-sm font-semibold text-slate-800">
                {{ preview.count }} persona(s)
                <span v-if="preview.category === 'MARKETING'" class="font-normal text-slate-500">
                  · solo quienes aceptan promociones
                </span>
              </span>
            </div>
            <p v-if="preview && preview.sample.length" class="text-xs text-slate-500">
              Por ejemplo: {{ preview.sample.slice(0, 6).map((c) => c.name || c.phone).join(', ') }}…
            </p>
          </fieldset>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">
              ¿Cuándo? <span class="font-normal text-slate-400">(hora de Colombia)</span>
            </label>
            <input v-model="form.when" type="datetime-local" class="w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>

          <div class="flex flex-wrap gap-2 pt-2">
            <Button label="Guardar borrador" severity="secondary" outlined :loading="saveMutation.isPending.value" @click="saveDraft" />
            <Button label="Enviar ahora" severity="secondary" :loading="saveMutation.isPending.value" @click="schedule(true)" />
            <Button label="Programar" icon="pi pi-calendar" :loading="saveMutation.isPending.value" @click="schedule(false)" />
          </div>
        </div>

        <div class="rounded-xl bg-[#e5ddd5] p-4">
          <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Así le llega a Ana
          </p>
          <TemplatePreview v-if="template" :components="template.components" :params="sampleParams" />
          <p v-else class="text-sm text-slate-500">Elige una plantilla.</p>
        </div>
      </div>
    </Dialog>

    <!-- Reporte -->
    <Dialog
      :visible="reportId !== null"
      modal
      :header="report ? report.broadcast.name : 'Reporte'"
      :draggable="false"
      class="w-full max-w-3xl"
      @update:visible="reportId = null"
    >
      <div v-if="report" class="flex flex-col gap-5">
        <p class="text-sm text-slate-500">
          {{ report.broadcast.template_name }} ·
          {{ report.broadcast.sent_at ? `salió el ${formatDateTime(report.broadcast.sent_at)}` : STATUS[report.broadcast.status].label }}
          · {{ audienceSummary(report.broadcast.audience) }}
        </p>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div class="rounded-xl bg-slate-50 p-3">
            <p class="text-xs text-slate-500">Destinatarios</p>
            <p class="text-2xl font-bold text-slate-900">{{ report.counts.total }}</p>
          </div>
          <div class="rounded-xl bg-emerald-50 p-3">
            <p class="text-xs text-emerald-700">Le llegó</p>
            <p class="text-2xl font-bold text-emerald-800">{{ report.delivered_total }}</p>
            <p class="text-xs text-emerald-700">{{ pct(report.delivered_total, report.counts.total) }}</p>
          </div>
          <div class="rounded-xl bg-sky-50 p-3">
            <p class="text-xs text-sky-700">Lo leyó</p>
            <p class="text-2xl font-bold text-sky-800">{{ report.counts.read }}</p>
            <p class="text-xs text-sky-700">{{ pct(report.counts.read, report.counts.total) }}</p>
          </div>
          <div class="rounded-xl bg-violet-50 p-3">
            <p class="text-xs text-violet-700">Respondió</p>
            <p class="text-2xl font-bold text-violet-800">{{ report.responders }}</p>
            <p class="text-xs text-violet-700">{{ pct(report.responders, report.counts.total) }}</p>
          </div>
          <div class="rounded-xl bg-rose-50 p-3">
            <p class="text-xs text-rose-700">Falló</p>
            <p class="text-2xl font-bold text-rose-800">{{ report.counts.failed }}</p>
            <p class="text-xs text-rose-700">{{ pct(report.counts.failed, report.counts.total) }}</p>
          </div>
        </div>
        <p v-if="report.counts.pending" class="text-sm text-amber-700">
          <i class="pi pi-spin pi-spinner mr-1" /> Faltan {{ report.counts.pending }} por salir.
        </p>

        <div v-if="report.buttons.length">
          <p class="mb-1 text-sm font-semibold text-slate-700">Botones que tocaron</p>
          <ul class="text-sm text-slate-600">
            <li v-for="b in report.buttons" :key="b.text">{{ b.text }} — <b>{{ b.count }}</b></li>
          </ul>
        </div>

        <div v-if="report.failures.length">
          <p class="mb-1 text-sm font-semibold text-slate-700">Por qué falló</p>
          <ul class="text-sm text-slate-600">
            <li v-for="f in report.failures" :key="f.reason" class="break-words">{{ f.reason }} — <b>{{ f.count }}</b></li>
          </ul>
        </div>

        <DataTable v-if="failedRecipients.length" :value="failedRecipients" size="small" scrollable scroll-height="240px">
          <Column field="name" header="Nombre" />
          <Column field="phone" header="Teléfono" />
          <Column field="error" header="Error" />
        </DataTable>
      </div>
      <p v-else-if="reportLoading" class="py-6 text-center text-slate-500">Cargando…</p>
    </Dialog>
  </div>
</template>

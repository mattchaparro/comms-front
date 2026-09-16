<script setup lang="ts">
// Plantillas de WhatsApp: lo que se ve es el ESPEJO local de comms-api
// (Meta decide el estado; el webhook message_template_status_update lo
// mantiene al dia y "Sincronizar" reconcilia lo creado por fuera). Crear
// aca = crear en Meta; la revision tarda hasta 24h (normalmente minutos).
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { computed, ref } from 'vue'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import { formatDateTime } from '@/utils/formatDateTime'
import { TEMPLATE_CATEGORIES, type TemplateCategory, type WhatsAppTemplate } from '@/types/templates'

import {
  createTemplate,
  deleteTemplate,
  fetchTemplates,
  syncTemplates,
} from '../services/templatesService'
import TemplatePreview from '../components/TemplatePreview.vue'

const queryClient = useQueryClient()
const toast = useToast()
const confirm = useConfirm()

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))

const appFilter = ref<string | null>(null)
const { data: templates, isLoading } = useQuery({
  queryKey: ['whatsapp-templates', appFilter] as const,
  queryFn: () => fetchTemplates(appFilter.value ?? undefined),
})

// --- sincronizar ---

const syncMutation = useMutation({
  mutationFn: (appId: string) => syncTemplates(appId),
  onSuccess: (rows) => {
    queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] })
    toast.add({
      severity: 'success',
      summary: `Sincronizado: ${rows.length} plantilla(s) en Meta`,
      life: 4000,
    })
  },
  onError: (error) => {
    const detail =
      isAxiosError<{ detail?: string }>(error) && error.response
        ? error.response.data?.detail
        : undefined
    toast.add({ severity: 'error', summary: 'No se pudo sincronizar', detail, life: 6000 })
  },
})

function sync(): void {
  const appId = appFilter.value ?? (appOptions.value.length === 1 ? appOptions.value[0] : null)
  if (!appId) {
    toast.add({
      severity: 'warn',
      summary: 'Elige una app para sincronizar',
      detail: 'La sincronización trae las plantillas de la WABA de UNA app.',
      life: 5000,
    })
    return
  }
  syncMutation.mutate(appId)
}

// --- crear ---

const dialogVisible = ref(false)
const formApp = ref<string | null>(null)
const formName = ref('')
const formLanguage = ref('es')
const formCategory = ref<TemplateCategory>('UTILITY')
const formBody = ref('')
const formFooter = ref('')
const formError = ref<string | null>(null)

function openCreate(): void {
  formApp.value = appFilter.value ?? (appOptions.value.length === 1 ? appOptions.value[0] : null)
  formName.value = ''
  formLanguage.value = 'es'
  formCategory.value = 'UTILITY'
  formBody.value = ''
  formFooter.value = ''
  formError.value = null
  dialogVisible.value = true
}

const createMutation = useMutation({
  mutationFn: () => {
    const components: Record<string, unknown>[] = [{ type: 'BODY', text: formBody.value.trim() }]
    if (formFooter.value.trim()) {
      components.push({ type: 'FOOTER', text: formFooter.value.trim() })
    }
    return createTemplate({
      app_id: formApp.value as string,
      name: formName.value.trim(),
      language: formLanguage.value.trim(),
      category: formCategory.value,
      components,
    })
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] })
    dialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: 'Plantilla enviada a revisión de Meta',
      detail: 'El estado se actualiza solo cuando Meta decida (normalmente minutos).',
      life: 6000,
    })
  },
  onError: (error) => {
    formError.value =
      isAxiosError<{ detail?: string }>(error) && error.response
        ? (error.response.data?.detail ?? 'No pudimos crear la plantilla.')
        : 'No pudimos crear la plantilla.'
  },
})

function save(): void {
  formError.value = null
  if (!formApp.value) {
    formError.value = 'Elige la app dueña de la plantilla.'
    return
  }
  if (!/^[a-z0-9_]+$/.test(formName.value.trim())) {
    formError.value = 'El nombre va en minúsculas, números y guion bajo (ej: recordatorio_cita).'
    return
  }
  if (!formBody.value.trim()) {
    formError.value = 'El cuerpo es obligatorio. Variables como {{1}}, {{2}}.'
    return
  }
  createMutation.mutate()
}

// --- borrar ---

const deleteMutation = useMutation({
  mutationFn: deleteTemplate,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] })
    toast.add({ severity: 'success', summary: 'Plantilla eliminada', life: 4000 })
  },
  onError: () => toast.add({ severity: 'error', summary: 'No se pudo eliminar', life: 5000 }),
})

function confirmDelete(template: WhatsAppTemplate): void {
  confirm.require({
    header: 'Eliminar plantilla',
    message:
      `Meta borra '${template.name}' en TODOS sus idiomas de esa WABA, no solo '${template.language}'. ` +
      'Los envíos que la usen empezarán a fallar.',
    acceptLabel: 'Eliminar',
    acceptProps: { severity: 'danger' },
    rejectLabel: 'Cancelar',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => deleteMutation.mutate(template.id),
  })
}

function bodyPreview(template: WhatsAppTemplate): string {
  const body = template.components.find((c) => c.type === 'BODY')
  return typeof body?.text === 'string' ? body.text : '—'
}

// --- detalle ---

const detail = ref<WhatsAppTemplate | null>(null)

function openDetail(template: WhatsAppTemplate): void {
  detail.value = template
}

const statusSeverity: Record<string, 'success' | 'danger' | 'warn' | 'info' | 'secondary'> = {
  APPROVED: 'success',
  REJECTED: 'danger',
  PAUSED: 'warn',
  DISABLED: 'danger',
  PENDING: 'info',
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Plantillas</h1>
        <p class="mt-1 text-sm text-slate-500">
          Mensajes pre-aprobados por Meta para escribir fuera de la ventana de 24 horas. El estado
          lo decide Meta y se refleja aquí solo.
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          icon="pi pi-sync"
          label="Sincronizar"
          severity="secondary"
          outlined
          :loading="syncMutation.isPending.value"
          @click="sync"
        />
        <Button label="Nueva plantilla" icon="pi pi-plus" @click="openCreate" />
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

    <DataTable
      :value="templates ?? []"
      :loading="isLoading"
      size="small"
      striped-rows
      selection-mode="single"
      :row-class="() => 'cursor-pointer'"
      @row-click="openDetail($event.data as WhatsAppTemplate)"
    >
      <Column field="app_id" header="App" />
      <Column field="name" header="Nombre" />
      <Column field="language" header="Idioma" />
      <Column field="category" header="Categoría" />
      <Column header="Estado">
        <template #body="{ data: row }">
          <div class="flex items-center gap-2">
            <Tag :value="row.status" :severity="statusSeverity[row.status] ?? 'secondary'" />
            <i v-if="row.reason" class="pi pi-info-circle text-slate-400" :title="row.reason" />
          </div>
        </template>
      </Column>
      <Column header="Calidad">
        <template #body="{ data: row }">{{ row.quality_score ?? '—' }}</template>
      </Column>
      <Column header="Cuerpo">
        <template #body="{ data: row }">
          <span class="block max-w-64 truncate text-sm text-slate-500" :title="bodyPreview(row)">
            {{ bodyPreview(row) }}
          </span>
        </template>
      </Column>
      <Column header="Actualizada">
        <template #body="{ data: row }">
          {{ row.last_synced_at ? formatDateTime(row.last_synced_at) : '—' }}
        </template>
      </Column>
      <Column header="">
        <template #body="{ data: row }">
          <div class="flex justify-end gap-1">
            <Button
              icon="pi pi-eye"
              text
              severity="secondary"
              title="Ver detalle"
              @click.stop="openDetail(row)"
            />
            <Button
              icon="pi pi-trash"
              text
              severity="danger"
              title="Eliminar (todos los idiomas)"
              @click.stop="confirmDelete(row)"
            />
          </div>
        </template>
      </Column>
      <template #empty>
        <p class="py-6 text-center text-slate-500">
          Sin plantillas en el espejo. "Sincronizar" trae las que ya existan en Meta.
        </p>
      </template>
    </DataTable>

    <!-- Detalle: la plantilla como la ve la clienta + la ficha técnica -->
    <Dialog
      :visible="detail !== null"
      modal
      :header="detail ? `${detail.name} · ${detail.language}` : ''"
      :draggable="false"
      class="w-full max-w-2xl"
      @update:visible="detail = null"
    >
      <div v-if="detail" class="grid gap-6 sm:grid-cols-2">
        <div class="rounded-xl bg-[#e5ddd5] p-4">
          <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Así la ve la clienta
          </p>
          <TemplatePreview :components="detail.components" />
        </div>

        <div class="flex flex-col gap-2 text-sm">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ficha</p>
          <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <span class="text-slate-400">Estado</span>
            <span>
              <Tag :value="detail.status" :severity="statusSeverity[detail.status] ?? 'secondary'" />
            </span>
            <span class="text-slate-400">App</span>
            <span class="font-medium text-slate-700">{{ detail.app_id }}</span>
            <span class="text-slate-400">Categoría</span>
            <span class="text-slate-700">{{ detail.category }}</span>
            <span class="text-slate-400">Calidad</span>
            <span class="text-slate-700">{{ detail.quality_score ?? '—' }}</span>
            <span class="text-slate-400">WABA</span>
            <span class="break-all font-mono text-xs text-slate-600">{{ detail.waba_id }}</span>
            <span class="text-slate-400">ID en Meta</span>
            <span class="break-all font-mono text-xs text-slate-600">{{ detail.meta_template_id ?? '—' }}</span>
            <span class="text-slate-400">Sincronizada</span>
            <span class="text-slate-700">{{ detail.last_synced_at ? formatDateTime(detail.last_synced_at) : '—' }}</span>
            <span class="text-slate-400">Creada</span>
            <span class="text-slate-700">{{ formatDateTime(detail.created_at) }}</span>
          </div>
          <Message v-if="detail.reason" severity="warn" :closable="false" class="mt-2">
            Meta dice: {{ detail.reason }}
          </Message>
          <p class="mt-auto pt-3 text-[11px] leading-snug text-slate-400">
            Las variables <code v-pre>{{1}}</code>, <code v-pre>{{2}}</code>… se llenan al enviar
            (o desde el nodo Plantilla del constructor de flujos).
          </p>
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      header="Nueva plantilla"
      :draggable="false"
      class="w-full max-w-md"
    >
      <div class="flex flex-col gap-4">
        <Message v-if="formError" severity="error" :closable="false">{{ formError }}</Message>
        <Message severity="info" :closable="false">
          Meta revisa cada plantilla (hasta 24h, normalmente minutos). Variables como
          <code v-pre>{{1}}</code> en el cuerpo.
        </Message>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">App</label>
          <Select v-model="formApp" :options="appOptions" placeholder="App dueña" fluid />
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2 flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">Nombre</label>
            <InputText v-model="formName" placeholder="recordatorio_cita" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">Idioma</label>
            <InputText v-model="formLanguage" fluid />
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Categoría</label>
          <Select v-model="formCategory" :options="[...TEMPLATE_CATEGORIES]" fluid />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Cuerpo</label>
          <Textarea v-model="formBody" rows="4" auto-resize fluid />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">
            Pie <span class="font-normal text-slate-400">(opcional)</span>
          </label>
          <InputText v-model="formFooter" fluid />
        </div>

        <div class="flex gap-2 pt-2">
          <Button label="Cancelar" severity="secondary" outlined class="flex-1" @click="dialogVisible = false" />
          <Button
            label="Enviar a revisión"
            class="flex-[2]"
            :loading="createMutation.isPending.value"
            @click="save"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>

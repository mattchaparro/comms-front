<script setup lang="ts">
// Flujos de conversación (el corazón de ManyChat en Connect): disparador
// por keyword o por API de la app, nodos con botones/links/condiciones/
// esperas y tags sobre el contacto. La edición normal es el builder visual
// (builder/FlowBuilderView.vue); el diálogo JSON de acá queda como "modo
// avanzado" sobre la misma definición validada por el backend.
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Chip from 'primevue/chip'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import { formatDateTime } from '@/utils/formatDateTime'
import { EXAMPLE_DEFINITION, type Flow } from '@/types/flows'

import { createFlow, deleteFlow, fetchFlows, updateFlow } from '../services/flowsService'

const queryClient = useQueryClient()
const toast = useToast()
const confirm = useConfirm()
const router = useRouter()

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))

const appFilter = ref<string | null>(null)
const { data: flows, isLoading } = useQuery({
  queryKey: ['flows', appFilter] as const,
  queryFn: () => fetchFlows(appFilter.value ?? undefined),
})

// --- crear / editar -----------------------------------------------------------

const dialogVisible = ref(false)
const editing = ref<Flow | null>(null)
const formApp = ref<string | null>(null)
const formName = ref('')
const formTrigger = ref<'api' | 'keyword'>('api')
const formKeywords = ref('')
const formDefinition = ref('')
const formError = ref<string | null>(null)

function openCreate(): void {
  editing.value = null
  formApp.value = appFilter.value ?? (appOptions.value.length === 1 ? appOptions.value[0] : null)
  formName.value = ''
  formTrigger.value = 'api'
  formKeywords.value = ''
  formDefinition.value = JSON.stringify(EXAMPLE_DEFINITION, null, 2)
  formError.value = null
  dialogVisible.value = true
}

function openEdit(flow: Flow): void {
  editing.value = flow
  formApp.value = flow.app_id
  formName.value = flow.name
  formTrigger.value = flow.trigger_type
  formKeywords.value = flow.trigger_keywords.join(', ')
  formDefinition.value = JSON.stringify(flow.definition, null, 2)
  formError.value = null
  dialogVisible.value = true
}

const saveMutation = useMutation({
  mutationFn: async () => {
    const definition = JSON.parse(formDefinition.value) as Record<string, unknown>
    const keywords = formKeywords.value
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    if (editing.value) {
      return updateFlow(editing.value.id, {
        trigger_type: formTrigger.value,
        trigger_keywords: keywords,
        definition,
      })
    }
    return createFlow({
      app_id: formApp.value as string,
      name: formName.value.trim(),
      trigger_type: formTrigger.value,
      trigger_keywords: keywords,
      definition,
    })
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['flows'] })
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: editing.value ? 'Flujo actualizado' : 'Flujo creado', life: 4000 })
  },
  onError: (error) => {
    if (error instanceof SyntaxError) {
      formError.value = `La definición no es JSON válido: ${error.message}`
      return
    }
    formError.value =
      isAxiosError<{ detail?: string }>(error) && error.response
        ? (error.response.data?.detail ?? 'No pudimos guardar el flujo.')
        : 'No pudimos guardar el flujo.'
  },
})

function save(): void {
  formError.value = null
  if (!editing.value) {
    if (!formApp.value) {
      formError.value = 'Elige la app dueña del flujo.'
      return
    }
    if (!/^[a-z0-9_-]+$/.test(formName.value.trim())) {
      formError.value = 'El nombre va en minúsculas, números, guion y guion bajo (ej: post_agenda).'
      return
    }
  }
  saveMutation.mutate()
}

// --- activar / borrar ---------------------------------------------------------

const toggleMutation = useMutation({
  mutationFn: (flow: Flow) => updateFlow(flow.id, { is_active: !flow.is_active }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
})

const deleteMutation = useMutation({
  mutationFn: deleteFlow,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['flows'] })
    toast.add({ severity: 'success', summary: 'Flujo eliminado', life: 4000 })
  },
})

function confirmDelete(flow: Flow): void {
  confirm.require({
    header: 'Eliminar flujo',
    message: `'${flow.name}' dejará de responder. Las sesiones en curso quedan huérfanas.`,
    acceptLabel: 'Eliminar',
    acceptProps: { severity: 'danger' },
    rejectLabel: 'Cancelar',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => deleteMutation.mutate(flow.id),
  })
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Flujos</h1>
        <p class="mt-1 text-sm text-slate-500">
          Conversaciones automáticas con botones, links y tags. Se disparan por palabra clave o
          cuando tu app lo pide (<code>POST /v1/flows/trigger</code>) — por ejemplo, al agendar una
          cita.
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          label="Modo avanzado (JSON)"
          icon="pi pi-code"
          severity="secondary"
          outlined
          @click="openCreate"
        />
        <Button
          label="Nuevo flujo"
          icon="pi pi-plus"
          @click="router.push({ name: 'flows.builder-new' })"
        />
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

    <DataTable :value="flows ?? []" :loading="isLoading" size="small" striped-rows>
      <Column field="app_id" header="App" />
      <Column field="name" header="Nombre" />
      <Column header="Disparador">
        <template #body="{ data: row }">
          <div class="flex flex-wrap items-center gap-1">
            <Tag
              :value="row.trigger_type === 'api' ? 'API' : 'keyword'"
              :severity="row.trigger_type === 'api' ? 'info' : 'success'"
            />
            <Chip
              v-for="keyword in row.trigger_keywords"
              :key="keyword"
              :label="keyword"
              class="!py-0.5 text-xs"
            />
          </div>
        </template>
      </Column>
      <Column header="Nodos">
        <template #body="{ data: row }">
          {{ Object.keys((row.definition as { nodes?: object }).nodes ?? {}).length }}
        </template>
      </Column>
      <Column header="Actualizado">
        <template #body="{ data: row }">{{ formatDateTime(row.updated_at) }}</template>
      </Column>
      <Column header="Activo">
        <template #body="{ data: row }">
          <ToggleSwitch :model-value="row.is_active" @update:model-value="toggleMutation.mutate(row)" />
        </template>
      </Column>
      <Column header="">
        <template #body="{ data: row }">
          <div class="flex justify-end gap-1">
            <Button
              icon="pi pi-sitemap"
              text
              title="Abrir en el constructor"
              @click="router.push({ name: 'flows.builder', params: { flowId: row.id } })"
            />
            <Button icon="pi pi-code" text severity="secondary" title="Modo avanzado (JSON)" @click="openEdit(row)" />
            <Button icon="pi pi-trash" text severity="danger" title="Eliminar" @click="confirmDelete(row)" />
          </div>
        </template>
      </Column>
      <template #empty>
        <p class="py-6 text-center text-slate-500">
          Sin flujos todavía. "Nuevo flujo" trae precargado el ejemplo real de la cita del spa.
        </p>
      </template>
    </DataTable>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="editing ? `Editar ${editing.name}` : 'Nuevo flujo'"
      :draggable="false"
      class="w-full max-w-2xl"
    >
      <div class="flex flex-col gap-4">
        <Message v-if="formError" severity="error" :closable="false">{{ formError }}</Message>

        <div v-if="!editing" class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">App</label>
            <Select v-model="formApp" :options="appOptions" placeholder="App dueña" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">Nombre</label>
            <InputText v-model="formName" placeholder="post_agenda" fluid />
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Disparador</label>
          <SelectButton
            v-model="formTrigger"
            :options="[
              { label: 'La app lo dispara (API)', value: 'api' },
              { label: 'Palabra clave entrante', value: 'keyword' },
            ]"
            option-label="label"
            option-value="value"
            :allow-empty="false"
          />
        </div>

        <div v-if="formTrigger === 'keyword'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">
            Palabras clave <span class="font-normal text-slate-400">(separadas por coma)</span>
          </label>
          <InputText v-model="formKeywords" placeholder="ayuda, menu" fluid />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Definición (nodos)</label>
          <p class="text-xs text-slate-500">
            Tipos: <code>message</code>, <code>buttons</code> (máx. 3, espera respuesta),
            <code>cta_url</code> (abre un link), <code>condition</code> (ramas
            <code>then</code>/<code>else</code> por <code>when</code>) y <code>delay</code>
            (<code>minutes</code> + <code>next</code>). Variables <code v-pre>{{asi}}</code> y
            <code v-pre>{{contact.name}}</code>; <code>add_tags</code>/<code>set_fields</code> por
            nodo. El backend valida al guardar.
          </p>
          <Textarea
            v-model="formDefinition"
            rows="14"
            class="font-mono !text-xs"
            auto-resize
            fluid
          />
        </div>

        <div class="flex gap-2 pt-2">
          <Button label="Cancelar" severity="secondary" outlined class="flex-1" @click="dialogVisible = false" />
          <Button label="Guardar" class="flex-[2]" :loading="saveMutation.isPending.value" @click="save" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

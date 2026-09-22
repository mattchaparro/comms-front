<script setup lang="ts">
// Formularios: los WhatsApp Flows de Meta, formularios nativos que la
// clienta llena DENTRO del chat (confirmar una cita, dejar sus datos...).
// No confundir con "Flujos" (el motor de conversaciones de Connect).
//
// Lo que se ve es el espejo de comms-api: Meta decide estado y validación.
// Ciclo: borrador -> validar (Connect y Meta) -> vista previa -> publicar.
// El Flow ID de uno publicado es el que la app usa para enviarlo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { computed, ref, watch } from 'vue'

import { fetchBusinessChannels } from '@/modules/channels/services/channelsService'
import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import { formatDateTime } from '@/utils/formatDateTime'
import {
  WHATSAPP_FLOW_CATEGORIES,
  WHATSAPP_FLOW_CATEGORY_LABELS,
  type FlowIssue,
  type WhatsAppFlow,
  type WhatsAppFlowCategory,
} from '@/types/whatsappFlows'

import WhatsAppFlowEditor, { type NewFlowContext } from '../components/WhatsAppFlowEditor.vue'
import {
  createWhatsAppFlowFromLibrary,
  deleteWhatsAppFlow,
  deprecateWhatsAppFlow,
  describeFlowError,
  fetchFlowLibrary,
  fetchWhatsAppFlows,
  generateWhatsAppFlow,
  syncWhatsAppFlows,
} from '../services/whatsappFlowsService'
import { statusLabel, statusSeverity } from '../status'

const queryClient = useQueryClient()
const toast = useToast()
const confirm = useConfirm()

const { data: apps } = useQuery({
  queryKey: ['comms-apps'] as const,
  queryFn: fetchCommsApps,
})
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))

const appFilter = ref<string | null>(null)
const { data: flows, isLoading } = useQuery({
  queryKey: ['whatsapp-flows', appFilter] as const,
  queryFn: () => fetchWhatsAppFlows(appFilter.value ?? undefined),
})

const { data: library } = useQuery({
  queryKey: ['whatsapp-flow-library'] as const,
  queryFn: fetchFlowLibrary,
})

const categoryOptions = WHATSAPP_FLOW_CATEGORIES.map((value) => ({
  value,
  label: WHATSAPP_FLOW_CATEGORY_LABELS[value],
}))

function categoryLabel(category: string): string {
  return WHATSAPP_FLOW_CATEGORY_LABELS[category as WhatsAppFlowCategory] ?? category
}

function errorCount(flow: WhatsAppFlow): number {
  return flow.validation_errors.filter((issue) => issue.severity === 'error').length
}

function invalidate(): void {
  queryClient.invalidateQueries({ queryKey: ['whatsapp-flows'] })
}

function defaultApp(): string | null {
  return appFilter.value ?? (appOptions.value.length === 1 ? appOptions.value[0] : null)
}

// --- sincronizar ---------------------------------------------------------------

const syncMutation = useMutation({
  mutationFn: (appId: string) => syncWhatsAppFlows({ app_id: appId }),
  onSuccess: (rows) => {
    invalidate()
    toast.add({
      severity: 'success',
      summary: `Sincronizado: ${rows.length} formulario(s) en Meta`,
      life: 4000,
    })
  },
  onError: (error) =>
    toast.add({
      severity: 'error',
      summary: 'No se pudo sincronizar',
      detail: describeFlowError(error, '').message || undefined,
      life: 6000,
    }),
})

function sync(): void {
  const appId = defaultApp()
  if (!appId) {
    toast.add({
      severity: 'warn',
      summary: 'Elige una app para sincronizar',
      detail: 'La sincronización trae los formularios de la WABA de UNA app.',
      life: 5000,
    })
    return
  }
  syncMutation.mutate(appId)
}

// --- nuevo formulario -----------------------------------------------------------

type CreateMode = 'ai' | 'library' | 'json'

const createVisible = ref(false)
const createMode = ref<CreateMode>('ai')
const formApp = ref<string | null>(null)
const formBusiness = ref<string | null>(null)
const formName = ref('')
const formCategories = ref<string[]>(['APPOINTMENT_BOOKING'])
const formDescription = ref('')
const formLibraryKey = ref<string | null>(null)
const formPublish = ref(false)
const formError = ref<string | null>(null)

// Negocios con número propio de la app elegida: el formulario vive en SU
// WABA. Sin elegir ninguno, en la WABA compartida de la app.
const { data: channels } = useQuery({
  queryKey: ['business-channels', formApp] as const,
  queryFn: () => fetchBusinessChannels(formApp.value ?? undefined),
  enabled: computed(() => formApp.value !== null),
})
const businessOptions = computed(() => [
  { label: 'WABA compartida de la app', value: null },
  ...(channels.value ?? [])
    .filter((channel) => channel.status === 'active')
    .map((channel) => ({
      label: `Negocio ${channel.business_id}${channel.display_phone_number ? ` · ${channel.display_phone_number}` : ''}`,
      value: channel.business_id,
    })),
])
watch(formApp, () => {
  formBusiness.value = null
})

const selectedLibraryEntry = computed(
  () => (library.value ?? []).find((entry) => entry.key === formLibraryKey.value) ?? null,
)
watch(selectedLibraryEntry, (entry) => {
  if (entry) {
    formName.value = entry.name
    formCategories.value = [...entry.categories]
  }
})

function openCreate(mode: CreateMode): void {
  createMode.value = mode
  formApp.value = defaultApp()
  formBusiness.value = null
  formName.value = ''
  formCategories.value = ['APPOINTMENT_BOOKING']
  formDescription.value = ''
  formLibraryKey.value = mode === 'library' ? (library.value?.[0]?.key ?? null) : null
  formPublish.value = false
  formError.value = null
  createVisible.value = true
}

function context(): NewFlowContext {
  return {
    app_id: formApp.value as string,
    business_id: formBusiness.value,
    name: formName.value.trim(),
    categories: formCategories.value,
  }
}

function checkForm(): boolean {
  formError.value = null
  if (!formApp.value) formError.value = 'Elige la app dueña del formulario.'
  else if (!formName.value.trim()) formError.value = 'Ponle un nombre (único en esa WABA).'
  else if (formCategories.value.length === 0) formError.value = 'Elige al menos una categoría.'
  else if (createMode.value === 'ai' && formDescription.value.trim().length < 10)
    formError.value = 'Describe el formulario: qué datos muestra y qué pide.'
  else if (createMode.value === 'library' && !formLibraryKey.value)
    formError.value = 'Elige una plantilla.'
  return formError.value === null
}

const generateMutation = useMutation({
  mutationFn: () =>
    generateWhatsAppFlow({
      ...context(),
      description: formDescription.value.trim(),
    }),
  onSuccess: (result) => {
    createVisible.value = false
    if (result.flow) invalidate()
    openEditor({
      flow: result.flow,
      context: context(),
      json: result.flow_json,
      issues: result.issues,
    })
    toast.add(
      result.ok
        ? {
            severity: 'success',
            summary: 'Formulario generado',
            detail: 'Pasa la validación de Connect y de Meta.',
            life: 5000,
          }
        : {
            severity: 'warn',
            summary: 'Generado con errores',
            detail: 'Corrígelos en el editor.',
            life: 6000,
          },
    )
  },
  onError: (error) => {
    formError.value = describeFlowError(error, 'No se pudo generar el formulario.').message
  },
})

const libraryMutation = useMutation({
  mutationFn: () =>
    createWhatsAppFlowFromLibrary({
      app_id: formApp.value as string,
      business_id: formBusiness.value,
      key: formLibraryKey.value as string,
      publish: formPublish.value,
    }),
  onSuccess: (flow) => {
    createVisible.value = false
    invalidate()
    openEditor({ flow, context: null, json: null, issues: undefined })
    toast.add({
      severity: 'success',
      summary: flow.status === 'PUBLISHED' ? 'Formulario publicado' : 'Borrador creado en Meta',
      detail: flow.meta_flow_id ? `Flow ID: ${flow.meta_flow_id}` : undefined,
      life: 6000,
    })
  },
  onError: (error) => {
    formError.value = describeFlowError(error, 'No se pudo crear desde la plantilla.').message
  },
})

function submitCreate(): void {
  if (!checkForm()) return
  if (createMode.value === 'ai') generateMutation.mutate()
  else if (createMode.value === 'library') libraryMutation.mutate()
  else {
    createVisible.value = false
    openEditor({
      flow: null,
      context: context(),
      json: library.value?.[0]?.flow_json ?? { version: '7.2', screens: [] },
      issues: [],
    })
  }
}

// --- editor ----------------------------------------------------------------------

interface EditorState {
  flow: WhatsAppFlow | null
  context: NewFlowContext | null
  json: Record<string, unknown> | null
  issues: FlowIssue[] | undefined
}

const editorState = ref<EditorState | null>(null)
// Remonta el editor en cada apertura: su estado interno arranca de las props.
const editorKey = ref(0)

function openEditor(state: EditorState): void {
  editorState.value = state
  editorKey.value += 1
}

function onSaved(flow: WhatsAppFlow): void {
  if (editorState.value) editorState.value = { ...editorState.value, flow }
  invalidate()
}

const editorTitle = computed(() => {
  const state = editorState.value
  if (!state) return ''
  return state.flow ? state.flow.name : `Nuevo: ${state.context?.name ?? ''}`
})

// --- deprecar / eliminar -------------------------------------------------------------

const deprecateMutation = useMutation({
  mutationFn: deprecateWhatsAppFlow,
  onSuccess: () => {
    invalidate()
    toast.add({
      severity: 'success',
      summary: 'Formulario deprecado',
      life: 4000,
    })
  },
  onError: (error) =>
    toast.add({
      severity: 'error',
      summary: describeFlowError(error, 'No se pudo deprecar').message,
      life: 6000,
    }),
})

const deleteMutation = useMutation({
  mutationFn: deleteWhatsAppFlow,
  onSuccess: () => {
    invalidate()
    toast.add({
      severity: 'success',
      summary: 'Borrador eliminado',
      life: 4000,
    })
  },
  onError: (error) =>
    toast.add({
      severity: 'error',
      summary: describeFlowError(error, 'No se pudo eliminar').message,
      life: 6000,
    }),
})

function confirmDeprecate(flow: WhatsAppFlow): void {
  confirm.require({
    header: 'Deprecar formulario',
    message:
      `'${flow.name}' dejará de abrirse y los envíos que lo usen (Flow ID ${flow.meta_flow_id}) ` +
      'empezarán a fallar. No se puede deshacer.',
    acceptLabel: 'Deprecar',
    acceptProps: { severity: 'danger' },
    rejectLabel: 'Cancelar',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => deprecateMutation.mutate(flow.id),
  })
}

function confirmDelete(flow: WhatsAppFlow): void {
  confirm.require({
    header: 'Eliminar borrador',
    message: `Se borra '${flow.name}' en Meta y en Connect.`,
    acceptLabel: 'Eliminar',
    acceptProps: { severity: 'danger' },
    rejectLabel: 'Cancelar',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => deleteMutation.mutate(flow.id),
  })
}

async function copyFlowId(flow: WhatsAppFlow): Promise<void> {
  if (!flow.meta_flow_id) return
  try {
    await navigator.clipboard.writeText(flow.meta_flow_id)
    toast.add({ severity: 'info', summary: 'Flow ID copiado', life: 2500 })
  } catch {
    toast.add({
      severity: 'warn',
      summary: 'No se pudo copiar',
      detail: flow.meta_flow_id,
      life: 5000,
    })
  }
}

const createBusy = computed(
  () => generateMutation.isPending.value || libraryMutation.isPending.value,
)
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:items-center">
      <div>
        <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Formularios</h1>
        <p class="mt-1 max-w-3xl text-sm text-slate-500">
          Formularios nativos de WhatsApp (WhatsApp Flows de Meta): la clienta los llena sin salir
          del chat. Se crean como borrador, Meta los valida y, al publicarlos, su Flow ID es el que
          tu app usa para enviarlos.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          icon="pi pi-sync"
          label="Sincronizar"
          severity="secondary"
          outlined
          :loading="syncMutation.isPending.value"
          @click="sync"
        />
        <Button
          label="Desde plantilla"
          icon="pi pi-clone"
          severity="secondary"
          outlined
          @click="openCreate('library')"
        />
        <Button label="Nuevo formulario" icon="pi pi-plus" @click="openCreate('ai')" />
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
      :value="flows ?? []"
      :loading="isLoading"
      size="small"
      striped-rows
      selection-mode="single"
      :row-class="() => 'cursor-pointer'"
      @row-click="
        openEditor({
          flow: $event.data as WhatsAppFlow,
          context: null,
          json: null,
          issues: undefined,
        })
      "
    >
      <Column field="app_id" header="App" />
      <Column header="Nombre">
        <template #body="{ data: row }">
          <div class="flex flex-col">
            <span class="font-medium text-slate-800">{{ row.name }}</span>
            <span v-if="row.business_id" class="text-xs text-slate-400"
              >Negocio {{ row.business_id }}</span
            >
          </div>
        </template>
      </Column>
      <Column header="Categoría">
        <template #body="{ data: row }">
          <span class="text-sm text-slate-600">{{
            row.categories.map(categoryLabel).join(', ') || '—'
          }}</span>
        </template>
      </Column>
      <Column header="Estado">
        <template #body="{ data: row }">
          <div class="flex items-center gap-2">
            <Tag :value="statusLabel(row.status)" :severity="statusSeverity(row.status)" />
            <span v-if="errorCount(row)" class="text-xs font-medium text-red-600">
              {{ errorCount(row) }} error(es)
            </span>
          </div>
        </template>
      </Column>
      <Column header="Flow ID">
        <template #body="{ data: row }">
          <button
            v-if="row.meta_flow_id"
            type="button"
            class="font-mono text-xs text-slate-600 hover:text-primary"
            title="Copiar Flow ID"
            @click.stop="copyFlowId(row)"
          >
            {{ row.meta_flow_id }} <i class="pi pi-copy text-[10px]" />
          </button>
          <span v-else class="text-slate-400">—</span>
        </template>
      </Column>
      <Column header="Actualizado">
        <template #body="{ data: row }">
          {{
            row.last_synced_at ? formatDateTime(row.last_synced_at) : formatDateTime(row.created_at)
          }}
        </template>
      </Column>
      <Column header="">
        <template #body="{ data: row }">
          <div class="flex justify-end gap-1">
            <Button
              icon="pi pi-pencil"
              text
              severity="secondary"
              :title="row.status === 'DRAFT' ? 'Editar' : 'Ver'"
              @click.stop="
                openEditor({
                  flow: row,
                  context: null,
                  json: null,
                  issues: undefined,
                })
              "
            />
            <Button
              v-if="row.status === 'PUBLISHED'"
              icon="pi pi-ban"
              text
              severity="danger"
              title="Deprecar"
              @click.stop="confirmDeprecate(row)"
            />
            <Button
              v-if="row.status === 'DRAFT'"
              icon="pi pi-trash"
              text
              severity="danger"
              title="Eliminar borrador"
              @click.stop="confirmDelete(row)"
            />
          </div>
        </template>
      </Column>
      <template #empty>
        <p class="py-6 text-center text-slate-500">
          Sin formularios. "Nuevo formulario" lo genera con IA a partir de una descripción;
          "Sincronizar" trae los que ya existan en el WhatsApp Manager.
        </p>
      </template>
    </DataTable>

    <!-- Nuevo: con IA, desde la biblioteca o JSON a mano -->
    <Dialog
      v-model:visible="createVisible"
      modal
      header="Nuevo formulario"
      :draggable="false"
      class="w-full max-w-lg"
    >
      <div class="flex flex-col gap-4">
        <SelectButton
          v-model="createMode"
          :options="[
            { label: 'Generar con IA', value: 'ai' },
            { label: 'Desde plantilla', value: 'library' },
            { label: 'JSON', value: 'json' },
          ]"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          class="w-full"
        />
        <Message v-if="formError" severity="error" :closable="false">{{ formError }}</Message>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">App</label>
            <Select v-model="formApp" :options="appOptions" placeholder="App dueña" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">WABA</label>
            <Select
              v-model="formBusiness"
              :options="businessOptions"
              option-label="label"
              option-value="value"
              :disabled="!formApp"
              fluid
            />
          </div>
        </div>

        <div v-if="createMode === 'library'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">Plantilla</label>
          <Select
            v-model="formLibraryKey"
            :options="library ?? []"
            option-label="title"
            option-value="key"
            placeholder="Elige una plantilla"
            fluid
          />
          <p v-if="selectedLibraryEntry" class="text-xs text-slate-500">
            {{ selectedLibraryEntry.description }}
          </p>
          <label class="mt-1 flex items-center gap-2 text-sm text-slate-700">
            <Checkbox v-model="formPublish" binary input-id="publish-now" />
            <span>Publicarlo de una vez (si Meta no reporta errores)</span>
          </label>
          <p class="text-xs text-slate-400">
            Si ya hay uno vigente de esta plantilla en esa WABA, se reusa en vez de duplicarlo.
          </p>
        </div>

        <template v-else>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700">Nombre</label>
              <InputText v-model="formName" placeholder="confirmar_cita" fluid />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700">Categoría</label>
              <MultiSelect
                v-model="formCategories"
                :options="categoryOptions"
                option-label="label"
                option-value="value"
                placeholder="Categoría"
                :max-selected-labels="1"
                fluid
              />
            </div>
          </div>

          <div v-if="createMode === 'ai'" class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">Qué debe pedir</label>
            <Textarea
              v-model="formDescription"
              rows="4"
              auto-resize
              fluid
              placeholder="Formulario para confirmar cita: servicio y fecha de solo lectura, hora de una lista, nombre opcional"
            />
            <p class="text-xs text-slate-500">
              La IA escribe el JSON, Connect lo valida y lo prueba contra Meta en un borrador; si
              Meta lo rechaza, reintenta con sus errores (hasta 2 veces). Tarda alrededor de un
              minuto.
            </p>
          </div>
          <p v-else class="text-xs text-slate-500">
            Abre el editor con la plantilla de confirmar cita como punto de partida.
          </p>
        </template>

        <div class="flex gap-2 pt-2">
          <Button
            label="Cancelar"
            severity="secondary"
            outlined
            class="flex-1"
            @click="createVisible = false"
          />
          <Button
            :label="
              createMode === 'ai'
                ? 'Generar'
                : createMode === 'library'
                  ? 'Crear en Meta'
                  : 'Abrir editor'
            "
            :icon="createMode === 'ai' ? 'pi pi-sparkles' : undefined"
            class="flex-[2]"
            :loading="createBusy"
            @click="submitCreate"
          />
        </div>
      </div>
    </Dialog>

    <!-- Editor: JSON + validación + vista previa -->
    <Dialog
      :visible="editorState !== null"
      modal
      maximizable
      :header="editorTitle"
      :draggable="false"
      class="w-full max-w-6xl"
      @update:visible="editorState = null"
    >
      <WhatsAppFlowEditor
        v-if="editorState"
        :key="editorKey"
        :flow="editorState.flow"
        :context="editorState.context"
        :initial-json="editorState.json"
        :initial-issues="editorState.issues"
        @saved="onSaved"
      />
    </Dialog>
  </div>
</template>

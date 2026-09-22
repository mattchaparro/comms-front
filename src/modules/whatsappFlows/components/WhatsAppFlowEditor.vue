<script setup lang="ts">
// Editor de UN formulario (WhatsApp Flow): JSON a la izquierda, errores y
// vista previa a la derecha. Tres niveles de validación, del más barato al
// que manda:
//   1. JSON parseable (en vivo, en el propio editor),
//   2. "Validar": el validador local de Connect (nombres de componentes,
//      init-values en el Form, Footer con complete, límites...),
//   3. "Guardar en Meta": se sube al borrador y Meta devuelve sus
//      validation_errors + la URL de vista previa.
// Un formulario publicado ya no se edita (regla de Meta): se ve en solo
// lectura y el camino es deprecarlo y crear otro.
import { useMutation } from '@tanstack/vue-query'
import Button from 'primevue/button'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { computed, ref } from 'vue'

import JsonEditor from '@/ui/JsonEditor.vue'
import type { FlowIssue, FlowTarget, WhatsAppFlow } from '@/types/whatsappFlows'

import {
  createWhatsAppFlow,
  describeFlowError,
  generateWhatsAppFlow,
  publishWhatsAppFlow,
  refreshWhatsAppFlow,
  regenerateWhatsAppFlow,
  updateWhatsAppFlowJson,
  validateFlowJsonLocally,
} from '../services/whatsappFlowsService'
import { statusLabel, statusSeverity } from '../status'

export interface NewFlowContext extends FlowTarget {
  name: string
  categories: string[]
}

const props = defineProps<{
  /** El formulario ya creado en Meta (null = todavía sin guardar). */
  flow: WhatsAppFlow | null
  /** Para uno nuevo: dónde y cómo se va a crear. */
  context: NewFlowContext | null
  initialJson: Record<string, unknown> | null
  initialIssues?: FlowIssue[]
}>()

const emit = defineEmits<{ saved: [flow: WhatsAppFlow] }>()

const current = ref<WhatsAppFlow | null>(props.flow)
const text = ref(pretty(props.initialJson ?? props.flow?.flow_json ?? {}))
const issues = ref<FlowIssue[]>(props.initialIssues ?? props.flow?.validation_errors ?? [])
const notice = ref<{
  severity: 'error' | 'success' | 'info' | 'warn'
  text: string
} | null>(null)
// Uno limpio y ya en Meta abre en la vista previa; con errores, en la lista.
const panel = ref<'issues' | 'preview'>(
  props.flow?.preview_url && !issues.value.some((issue) => issue.severity === 'error')
    ? 'preview'
    : 'issues',
)
const selectedLine = ref<number | null>(null)
const editor = ref<InstanceType<typeof JsonEditor> | null>(null)

const savedText = ref(pretty(props.flow?.flow_json ?? null))
const dirty = computed(() => current.value === null || text.value !== savedText.value)
const readonly = computed(() => current.value !== null && current.value.status !== 'DRAFT')
const errors = computed(() => issues.value.filter((issue) => issue.severity === 'error'))
const warnings = computed(() => issues.value.filter((issue) => issue.severity === 'warning'))
const canPublish = computed(
  () => current.value?.status === 'DRAFT' && errors.value.length === 0 && !dirty.value,
)

// Cada vez que Meta acepta el JSON (guardar, generar, refrescar), lo
// siguiente que hay que hacer es mirarlo: se pasa a la vista previa.
function showPreviewIfClean(): void {
  if (current.value?.preview_url && errors.value.length === 0) panel.value = 'preview'
}

function pretty(value: unknown): string {
  // Misma indentación que el JSON que Connect sube a Meta: así la línea
  // de un error de Meta es la misma línea de este editor.
  return value === null ? '' : JSON.stringify(value, null, 2)
}

function parsed(): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text.value) as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
    notice.value = {
      severity: 'error',
      text: 'El Flow JSON tiene que ser un objeto { ... }.',
    }
  } catch {
    notice.value = {
      severity: 'error',
      text: 'Corrige el JSON antes de continuar (ver el aviso debajo del editor).',
    }
  }
  return null
}

function applyFlow(flow: WhatsAppFlow): void {
  current.value = flow
  issues.value = flow.validation_errors
  savedText.value = pretty(flow.flow_json)
  text.value = savedText.value
  emit('saved', flow)
}

function jumpTo(issue: FlowIssue): void {
  if (issue.line) {
    selectedLine.value = issue.line
    editor.value?.goToLine(issue.line)
  }
}

// --- validar (local) --------------------------------------------------------

const validateMutation = useMutation({
  mutationFn: (flowJson: Record<string, unknown>) => validateFlowJsonLocally(flowJson),
  onSuccess: (result) => {
    // Los de Meta del último guardado siguen valiendo hasta que se vuelva a subir.
    issues.value = [...result, ...issues.value.filter((issue) => issue.source === 'meta')]
    panel.value = 'issues'
    notice.value = result.some((issue) => issue.severity === 'error')
      ? {
          severity: 'error',
          text: 'El validador de Connect encontró errores: corrígelos antes de subir a Meta.',
        }
      : {
          severity: 'success',
          text: 'Pasa el validador de Connect. "Guardar en Meta" lo valida con Meta.',
        }
  },
  onError: (error) => {
    notice.value = {
      severity: 'error',
      text: describeFlowError(error, 'No se pudo validar.').message,
    }
  },
})

function validate(): void {
  notice.value = null
  const flowJson = parsed()
  if (flowJson) validateMutation.mutate(flowJson)
}

// --- guardar en Meta (crear o subir JSON) -------------------------------------

const saveMutation = useMutation({
  mutationFn: (flowJson: Record<string, unknown>) => {
    if (current.value) return updateWhatsAppFlowJson(current.value.id, flowJson)
    const context = props.context as NewFlowContext
    return createWhatsAppFlow({ ...context, flow_json: flowJson })
  },
  onSuccess: (flow) => {
    applyFlow(flow)
    showPreviewIfClean()
    const metaErrors = flow.validation_errors.filter(
      (i) => i.source === 'meta' && i.severity === 'error',
    )
    notice.value = metaErrors.length
      ? {
          severity: 'warn',
          text: `Guardado como borrador, pero Meta reporta ${metaErrors.length} error(es).`,
        }
      : {
          severity: 'success',
          text: 'Guardado en Meta sin errores. Revisa la vista previa y publícalo.',
        }
  },
  onError: (error) => showError(error, 'No se pudo guardar en Meta.'),
})

function save(): void {
  notice.value = null
  const flowJson = parsed()
  if (flowJson) saveMutation.mutate(flowJson)
}

function showError(error: unknown, fallback: string): void {
  const described = describeFlowError(error, fallback)
  notice.value = { severity: 'error', text: described.message }
  if (described.issues.length) {
    issues.value = described.issues
    panel.value = 'issues'
  }
}

// --- generar con IA ----------------------------------------------------------

const aiOpen = ref(false)
const aiDescription = ref('')

const generateMutation = useMutation({
  mutationFn: () => {
    if (current.value) return regenerateWhatsAppFlow(current.value.id, aiDescription.value.trim())
    const context = props.context as NewFlowContext
    return generateWhatsAppFlow({
      ...context,
      description: aiDescription.value.trim(),
    })
  },
  onSuccess: (result) => {
    if (result.flow) applyFlow(result.flow)
    if (result.flow_json) text.value = pretty(result.flow_json)
    issues.value = result.issues
    panel.value = 'issues'
    if (result.ok) showPreviewIfClean()
    aiOpen.value = false
    notice.value = result.ok
      ? {
          severity: 'success',
          text: `Listo en ${result.attempts} intento(s): pasa el validador de Connect y el de Meta.`,
        }
      : {
          severity: 'warn',
          text: `Tras ${result.attempts} intentos quedan errores: corrígelos a mano en el editor${result.flow ? ' y guarda' : ''}.`,
        }
  },
  onError: (error) => showError(error, 'No se pudo generar.'),
})

function generate(): void {
  notice.value = null
  if (aiDescription.value.trim().length < 10) {
    notice.value = {
      severity: 'warn',
      text: 'Describe el formulario con un poco más de detalle.',
    }
    return
  }
  generateMutation.mutate()
}

// --- publicar / refrescar -------------------------------------------------------

const publishMutation = useMutation({
  mutationFn: () => publishWhatsAppFlow((current.value as WhatsAppFlow).id),
  onSuccess: (flow) => {
    applyFlow(flow)
    notice.value = {
      severity: 'success',
      text: `Publicado. Flow ID para enviarlo: ${flow.meta_flow_id}. Ya no se puede editar.`,
    }
  },
  onError: (error) => showError(error, 'No se pudo publicar.'),
})

const refreshMutation = useMutation({
  mutationFn: () => refreshWhatsAppFlow((current.value as WhatsAppFlow).id),
  onSuccess: (flow) => {
    const keepText = dirty.value ? text.value : null
    applyFlow(flow)
    if (keepText !== null) text.value = keepText
  },
  onError: (error) => showError(error, 'No se pudo leer el estado en Meta.'),
})

const busy = computed(
  () =>
    validateMutation.isPending.value ||
    saveMutation.isPending.value ||
    generateMutation.isPending.value ||
    publishMutation.isPending.value ||
    refreshMutation.isPending.value,
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <template v-if="current">
        <Tag :value="statusLabel(current.status)" :severity="statusSeverity(current.status)" />
        <span class="text-slate-500">Flow ID</span>
        <code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{{
          current.meta_flow_id ?? '—'
        }}</code>
        <span v-if="current.json_version" class="text-slate-400"
          >· versión {{ current.json_version }}</span
        >
      </template>
      <Tag v-else value="Sin guardar" severity="secondary" />
      <span v-if="current && dirty && !readonly" class="text-xs text-amber-600"
        >· cambios sin subir a Meta</span
      >
    </div>

    <Message v-if="readonly" severity="info" :closable="false">
      Meta no deja editar un formulario
      {{ current?.status === 'PUBLISHED' ? 'publicado' : 'deprecado' }}. Para cambiarlo, crea uno
      nuevo (puedes copiar este JSON) y deprecia este.
    </Message>
    <Message v-if="notice" :severity="notice.severity" :closable="false">{{ notice.text }}</Message>

    <div
      v-if="aiOpen && !readonly"
      class="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3"
    >
      <label class="text-sm font-medium text-slate-700">
        {{ current ? 'Qué cambiar o volver a generar' : 'Describe el formulario' }}
      </label>
      <Textarea
        v-model="aiDescription"
        rows="3"
        auto-resize
        fluid
        placeholder="Formulario para confirmar cita: servicio y fecha de solo lectura, hora de una lista, nombre opcional"
      />
      <p class="text-xs text-slate-500">
        La IA escribe el JSON; Connect lo valida y, si Meta lo rechaza, le devuelve los errores
        (hasta 2 reintentos). Tarda alrededor de un minuto.
      </p>
      <div class="flex justify-end gap-2">
        <Button label="Cancelar" severity="secondary" text size="small" @click="aiOpen = false" />
        <Button
          label="Generar"
          icon="pi pi-sparkles"
          size="small"
          :loading="generateMutation.isPending.value"
          @click="generate"
        />
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <JsonEditor
        ref="editor"
        v-model="text"
        :rows="22"
        :readonly="readonly"
        :highlight-line="selectedLine"
      />

      <div class="flex min-w-0 flex-col gap-3">
        <SelectButton
          v-model="panel"
          :options="[
            {
              label: `Validación${errors.length ? ` (${errors.length})` : ''}`,
              value: 'issues',
            },
            { label: 'Vista previa', value: 'preview' },
          ]"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
        />

        <div v-if="panel === 'issues'" class="flex max-h-[30rem] flex-col gap-2 overflow-y-auto">
          <p v-if="issues.length === 0" class="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
            Sin errores reportados. "Validar" corre el validador de Connect; "Guardar en Meta", el
            de Meta.
          </p>
          <button
            v-for="(issue, index) in [...errors, ...warnings]"
            :key="index"
            type="button"
            class="flex flex-col gap-1 rounded-md border p-2 text-left text-sm"
            :class="[
              issue.severity === 'error'
                ? 'border-red-200 bg-red-50'
                : 'border-amber-200 bg-amber-50',
              issue.line ? 'cursor-pointer hover:brightness-95' : 'cursor-default',
            ]"
            @click="jumpTo(issue)"
          >
            <span class="flex items-center gap-1.5">
              <Tag
                :value="issue.source === 'meta' ? 'Meta' : 'Connect'"
                :severity="issue.source === 'meta' ? 'info' : 'secondary'"
                class="!px-1.5 !py-0 !text-[10px]"
              />
              <span
                class="text-[11px] font-semibold uppercase"
                :class="issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'"
              >
                {{ issue.severity === 'error' ? 'Error' : 'Advertencia' }}
              </span>
            </span>
            <span class="text-slate-800">{{ issue.message }}</span>
            <code v-if="issue.path" class="break-all text-[11px] text-slate-500">{{
              issue.path
            }}</code>
          </button>
        </div>

        <div v-else class="flex flex-col gap-2">
          <template v-if="current?.preview_url">
            <iframe
              :src="current.preview_url"
              title="Vista previa del formulario en WhatsApp"
              class="h-[30rem] w-full rounded-xl border border-slate-200 bg-white"
            />
            <div class="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>La vista previa la genera Meta con los <code>__example__</code>.</span>
              <a
                :href="current.preview_url"
                target="_blank"
                rel="noopener"
                class="shrink-0 text-primary hover:underline"
              >
                Abrir en pestaña <i class="pi pi-external-link text-[10px]" />
              </a>
            </div>
          </template>
          <p v-else class="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
            La vista previa la genera Meta: aparece al guardar el formulario en Meta.
          </p>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
      <Button
        v-if="!readonly"
        label="Generar con IA"
        icon="pi pi-sparkles"
        severity="secondary"
        outlined
        :disabled="busy"
        @click="aiOpen = !aiOpen"
      />
      <Button
        v-if="current"
        label="Actualizar desde Meta"
        icon="pi pi-refresh"
        severity="secondary"
        text
        :loading="refreshMutation.isPending.value"
        :disabled="busy"
        @click="refreshMutation.mutate()"
      />
      <Button
        v-if="!readonly"
        label="Validar"
        icon="pi pi-check-circle"
        severity="secondary"
        outlined
        :loading="validateMutation.isPending.value"
        :disabled="busy"
        @click="validate"
      />
      <Button
        v-if="!readonly"
        :label="current ? 'Guardar en Meta' : 'Crear borrador en Meta'"
        icon="pi pi-cloud-upload"
        :loading="saveMutation.isPending.value"
        :disabled="busy || (current !== null && !dirty)"
        @click="save"
      />
      <Button
        v-if="current?.status === 'DRAFT'"
        label="Publicar"
        icon="pi pi-send"
        severity="success"
        :loading="publishMutation.isPending.value"
        :disabled="busy || !canPublish"
        :title="canPublish ? '' : 'Guarda en Meta y corrige los errores antes de publicar'"
        @click="publishMutation.mutate()"
      />
    </div>
  </div>
</template>

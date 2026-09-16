<script setup lang="ts">
// El builder visual de flujos: la versión Nexolú Connect del editor de
// ManyChat. Canvas de nodos arrastrables (@vue-flow/core) + paleta a la
// izquierda + panel de edición a la derecha. Serializa al MISMO JSON que
// valida el backend (ver builder/graph.ts) — el editor JSON de FlowsView
// queda como "modo avanzado" sobre el mismo flujo.
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { VueFlow, useVueFlow, type Edge, type NodeMouseEvent } from '@vue-flow/core'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import type { FlowDefinition, FlowNodeDef, FlowNodeType } from '@/types/flows'

import { createFlow, fetchFlows, updateFlow } from '../services/flowsService'
import FlowNodeCard from './FlowNodeCard.vue'
import {
  NODE_CATALOG,
  autoLayout,
  defaultNodeDef,
  definitionToGraph,
  graphToDefinition,
  makeEdge,
  newButtonId,
  newNodeId,
  type BuilderNode,
} from './graph'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const queryClient = useQueryClient()

const flowId = computed(() => (route.params.flowId as string | undefined) ?? null)

const { data: apps } = useQuery({ queryKey: ['comms-apps'] as const, queryFn: fetchCommsApps })
const appOptions = computed(() => (apps.value ?? []).map((app) => app.app_id))

const { data: flows } = useQuery({ queryKey: ['flows'] as const, queryFn: () => fetchFlows() })

// --- estado del grafo ---------------------------------------------------------

// `as Ref<...>` en vez del generico: los tipos de @vue-flow/core hacen
// estallar la instanciacion de UnwrapRef (TS2589); el cast evita esa
// expansion sin cambiar nada en runtime.
const nodes = ref([]) as Ref<BuilderNode[]>
const edges = ref([]) as Ref<Edge[]>

const selectedId = ref<string | null>(null)
const loadedFor = ref<string | null>(null)

const metaName = ref('')
const metaApp = ref<string | null>(null)
const metaTrigger = ref<'api' | 'keyword'>('api')
const metaKeywords = ref('')
const saveError = ref<string | null>(null)

const {
  onConnect,
  addEdges,
  removeEdges,
  updateNodeInternals,
  fitView,
  zoomIn,
  zoomOut,
  screenToFlowCoordinate,
  removeNodes,
  getEdges,
} = useVueFlow()

// El rail de controles del canvas (zoom, encuadrar, ordenar) - mismo
// vocabulario que cualquier builder de flujos.
function applyAutoLayout(): void {
  const definition = graphToDefinition(nodes.value, edges.value)
  const positions = autoLayout(definition)
  for (const node of nodes.value) {
    const position = positions[node.id]
    if (position) node.position = { x: position.x + 40, y: position.y + 40 }
  }
  void nextTick(() => fitView({ padding: 0.2 }))
}

function duplicateSelected(): void {
  const source = selectedNode.value
  if (!source) return
  const ids = new Set<string>()
  for (const existing of nodes.value) ids.add(existing.id)
  const id = newNodeId(ids)
  const def = JSON.parse(JSON.stringify(source.data!.def)) as FlowNodeDef
  const copy: BuilderNode = {
    id,
    type: 'flow',
    position: { x: source.position.x + 40, y: source.position.y + 40 },
    data: { def, isStart: false },
  }
  nodes.value = [...nodes.value, copy]
  selectedId.value = id
}

// Cargar el flujo a editar (o arrancar vacío para uno nuevo).
watch(
  [flows, flowId],
  () => {
    const key = flowId.value ?? '(nuevo)'
    if (loadedFor.value === key) return
    if (flowId.value) {
      const flow = (flows.value ?? []).find((f) => f.id === flowId.value)
      if (!flow) return
      const graph = definitionToGraph(flow.definition as unknown as FlowDefinition)
      nodes.value = graph.nodes
      edges.value = graph.edges
      metaName.value = flow.name
      metaApp.value = flow.app_id
      metaTrigger.value = flow.trigger_type
      metaKeywords.value = flow.trigger_keywords.join(', ')
    } else {
      nodes.value = []
      edges.value = []
      metaName.value = ''
      metaApp.value = null
      metaTrigger.value = 'api'
      metaKeywords.value = ''
    }
    loadedFor.value = key
    void nextTick(() => fitView({ padding: 0.2 }))
  },
  { immediate: true },
)

// --- conexiones ---------------------------------------------------------------

onConnect((connection) => {
  if (!connection.sourceHandle) return
  // Una sola salida por handle: reconectar reemplaza la arista anterior.
  // OJO: quitar por el store (removeEdges), no filtrando nuestro ref — el
  // v-model de Vue Flow re-emite su lista interna y pisaria el filtro.
  const stale = getEdges.value.filter(
    (e) => e.source === connection.source && e.sourceHandle === connection.sourceHandle,
  )
  if (stale.length > 0) removeEdges(stale.map((e) => e.id))
  addEdges([makeEdge(connection.source, connection.sourceHandle, connection.target)])
})

// --- paleta: click y drag&drop ------------------------------------------------

function addNode(type: FlowNodeType, position?: { x: number; y: number }): void {
  const ids = new Set<string>()
  for (const existing of nodes.value) ids.add(existing.id)
  const id = newNodeId(ids)
  const fallback = { x: 80 + nodes.value.length * 40, y: 80 + nodes.value.length * 40 }
  const node: BuilderNode = {
    id,
    type: 'flow',
    position: position ?? fallback,
    data: { def: defaultNodeDef(type), isStart: nodes.value.length === 0 },
  }
  nodes.value = [...nodes.value, node]
  selectedId.value = id
}

function onPaletteDragStart(event: DragEvent, type: FlowNodeType): void {
  event.dataTransfer?.setData('application/nexolu-flow-node', type)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onCanvasDragOver(event: DragEvent): void {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onCanvasDrop(event: DragEvent): void {
  const type = event.dataTransfer?.getData('application/nexolu-flow-node') as FlowNodeType | ''
  if (!type || !(type in NODE_CATALOG)) return
  addNode(type, screenToFlowCoordinate({ x: event.clientX, y: event.clientY }))
}

// --- selección y edición ------------------------------------------------------

const selectedNode = computed(
  () => nodes.value.find((n) => n.id === selectedId.value) ?? null,
)

function onNodeClick({ node }: NodeMouseEvent): void {
  selectedId.value = node.id
}

function markAsStart(): void {
  for (const node of nodes.value) node.data!.isStart = node.id === selectedId.value
}

function deleteSelected(): void {
  if (!selectedId.value) return
  const wasStart = selectedNode.value?.data?.isStart
  removeNodes([selectedId.value], true)
  nodes.value = nodes.value.filter((n) => n.id !== selectedId.value)
  edges.value = edges.value.filter(
    (e) => e.source !== selectedId.value && e.target !== selectedId.value,
  )
  selectedId.value = null
  if (wasStart && nodes.value.length > 0) nodes.value[0].data!.isStart = true
}

// Botones del nodo `buttons`: agregar/quitar refresca los handles.
function addButton(): void {
  const def = selectedNode.value?.data?.def
  if (!def?.buttons || def.buttons.length >= 3) return
  def.buttons.push({ id: newButtonId(def.buttons), title: '' })
  void nextTick(() => updateNodeInternals([selectedId.value!]))
}

function removeButton(index: number): void {
  const def = selectedNode.value?.data?.def
  if (!def?.buttons) return
  const [removed] = def.buttons.splice(index, 1)
  edges.value = edges.value.filter(
    (e) => !(e.source === selectedId.value && e.sourceHandle === `btn:${removed.id}`),
  )
  void nextTick(() => updateNodeInternals([selectedId.value!]))
}

// La condición se edita con una forma canónica (una sola clave del `when`).
const conditionKind = computed({
  get(): 'tag' | 'not_tag' | 'field' {
    const when = selectedNode.value?.data?.def.when ?? {}
    if (when.not_tag !== undefined) return 'not_tag'
    if (when.field !== undefined) return 'field'
    return 'tag'
  },
  set(kind: 'tag' | 'not_tag' | 'field') {
    const def = selectedNode.value?.data?.def
    if (!def) return
    def.when =
      kind === 'field' ? { field: '', equals: '' } : kind === 'tag' ? { tag: '' } : { not_tag: '' }
  },
})

const conditionOp = computed({
  get(): 'equals' | 'not_equals' | 'contains' | 'exists' {
    const when = selectedNode.value?.data?.def.when ?? {}
    if (when.not_equals !== undefined) return 'not_equals'
    if (when.contains !== undefined) return 'contains'
    if (when.exists !== undefined) return 'exists'
    return 'equals'
  },
  set(op: 'equals' | 'not_equals' | 'contains' | 'exists') {
    const def = selectedNode.value?.data?.def
    if (!def?.when) return
    const field = def.when.field ?? ''
    def.when = op === 'exists' ? { field, exists: true } : { field, [op]: '' }
  },
})

const conditionValue = computed({
  get(): string {
    const when = selectedNode.value?.data?.def.when ?? {}
    return String(when.equals ?? when.not_equals ?? when.contains ?? '')
  },
  set(value: string) {
    const when = selectedNode.value?.data?.def.when
    if (!when) return
    const op = conditionOp.value
    if (op !== 'exists') (when as Record<string, string>)[op] = value
  },
})

// Delay en unidades humanas.
const delayUnitRaw = ref<1 | 60 | 1440>(60)
const delayAmount = computed({
  get(): number {
    const minutes = selectedNode.value?.data?.def.minutes ?? 60
    return Math.max(1, Math.round(minutes / delayUnitRaw.value))
  },
  set(amount: number) {
    const def = selectedNode.value?.data?.def
    if (def) def.minutes = Math.max(1, Math.round(amount)) * delayUnitRaw.value
  },
})
// Cambiar la unidad recalcula los minutos con la cantidad visible
// (1 «hora» -> 1 «minuto» = 1 minuto, no una hora disfrazada).
const delayUnit = computed({
  get: () => delayUnitRaw.value,
  set(unit: 1 | 60 | 1440) {
    const amount = delayAmount.value
    delayUnitRaw.value = unit
    const def = selectedNode.value?.data?.def
    if (def) def.minutes = amount * unit
  },
})
watch(selectedId, () => {
  const minutes = selectedNode.value?.data?.def.minutes
  if (minutes === undefined) return
  delayUnitRaw.value = minutes % 1440 === 0 ? 1440 : minutes % 60 === 0 ? 60 : 1
})

// Efectos (cualquier nodo): tags por coma, fields como campo=valor por línea.
const addTagsText = computed({
  get: () => (selectedNode.value?.data?.def.add_tags ?? []).join(', '),
  set(value: string) {
    const def = selectedNode.value?.data?.def
    if (def) def.add_tags = splitList(value)
  },
})
const removeTagsText = computed({
  get: () => (selectedNode.value?.data?.def.remove_tags ?? []).join(', '),
  set(value: string) {
    const def = selectedNode.value?.data?.def
    if (def) def.remove_tags = splitList(value)
  },
})
const setFieldsText = computed({
  get: () =>
    Object.entries(selectedNode.value?.data?.def.set_fields ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
  set(value: string) {
    const def = selectedNode.value?.data?.def
    if (!def) return
    const fields: Record<string, string> = {}
    for (const line of value.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) fields[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    def.set_fields = fields
  },
})

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

// --- guardar ------------------------------------------------------------------

const saveMutation = useMutation({
  mutationFn: async () => {
    const definition = graphToDefinition(nodes.value, edges.value) as unknown as Record<
      string,
      unknown
    >
    const keywords = splitList(metaKeywords.value)
    if (flowId.value) {
      return updateFlow(flowId.value, {
        trigger_type: metaTrigger.value,
        trigger_keywords: keywords,
        definition,
      })
    }
    return createFlow({
      app_id: metaApp.value as string,
      name: metaName.value.trim(),
      trigger_type: metaTrigger.value,
      trigger_keywords: keywords,
      definition,
    })
  },
  onSuccess: (flow) => {
    queryClient.invalidateQueries({ queryKey: ['flows'] })
    toast.add({ severity: 'success', summary: 'Flujo guardado', life: 3000 })
    if (!flowId.value) {
      loadedFor.value = flow.id // el grafo en pantalla ya es este flujo
      void router.replace({ name: 'flows.builder', params: { flowId: flow.id } })
    }
  },
  onError: (error) => {
    saveError.value =
      isAxiosError<{ detail?: string }>(error) && error.response
        ? (error.response.data?.detail ?? 'No pudimos guardar el flujo.')
        : 'No pudimos guardar el flujo.'
  },
})

function save(): void {
  saveError.value = null
  if (nodes.value.length === 0) {
    saveError.value = 'Agrega al menos un nodo desde la paleta.'
    return
  }
  if (!flowId.value) {
    if (!metaApp.value) {
      saveError.value = 'Elige la app dueña del flujo (panel derecho, sin nodo seleccionado).'
      return
    }
    if (!/^[a-z0-9_-]+$/.test(metaName.value.trim())) {
      saveError.value = 'El nombre va en minúsculas, números, guion y guion bajo (ej: post_agenda).'
      return
    }
  }
  saveMutation.mutate()
}

const paletteTypes = Object.entries(NODE_CATALOG) as [
  FlowNodeType,
  (typeof NODE_CATALOG)[FlowNodeType],
][]
</script>

<template>
  <div class="flex h-[calc(100vh-7.5rem)] min-h-[520px] flex-col">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <Button
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          title="Volver a flujos"
          @click="router.push({ name: 'flows' })"
        />
        <div>
          <h1 class="text-xl font-bold text-slate-900">
            {{ flowId ? `Constructor · ${metaName}` : 'Nuevo flujo' }}
          </h1>
          <p class="text-xs text-slate-500">
            Arrastra nodos desde la paleta, conéctalos por los puntos y edítalos en el panel.
            Selecciona una flecha y pulsa Supr para desconectarla.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Message v-if="saveError" severity="error" :closable="false" class="!py-1 text-xs">
          {{ saveError }}
        </Message>
        <Button
          label="Guardar"
          icon="pi pi-check"
          :loading="saveMutation.isPending.value"
          @click="save"
        />
      </div>
    </div>

    <div class="flex min-h-0 flex-1 gap-3">
      <!-- Paleta -->
      <aside class="flex w-44 shrink-0 flex-col gap-2 overflow-y-auto">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Nodos</p>
        <button
          v-for="[type, item] in paletteTypes"
          :key="type"
          class="cursor-grab rounded-xl border border-dashed border-slate-300 bg-white p-2.5 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/40 active:cursor-grabbing"
          draggable="true"
          :title="item.description"
          @dragstart="onPaletteDragStart($event, type)"
          @click="addNode(type)"
        >
          <span class="flex items-center gap-2 text-sm font-medium text-slate-700">
            <span
              class="flex h-6 w-6 items-center justify-center rounded-md"
              :style="{ backgroundColor: item.headerBg }"
            >
              <i :class="item.icon" class="text-xs" :style="{ color: item.accent }" />
            </span>
            {{ item.label }}
          </span>
          <span class="mt-1 block text-[11px] leading-tight text-slate-400">
            {{ item.description }}
          </span>
        </button>
      </aside>

      <!-- Canvas -->
      <div
        class="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white"
        @dragover="onCanvasDragOver"
        @drop="onCanvasDrop"
      >
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :delete-key-code="['Backspace', 'Delete']"
          :min-zoom="0.3"
          :max-zoom="1.6"
          fit-view-on-init
          class="nexolu-flow-canvas"
          @node-click="onNodeClick"
          @pane-click="selectedId = null"
        >
          <template #node-flow="props">
            <FlowNodeCard :id="props.id" :data="props.data" :selected="props.id === selectedId" />
          </template>
        </VueFlow>

        <!-- Rail de controles del canvas -->
        <div class="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
            title="Acercar"
            @click="zoomIn()"
          >
            <i class="pi pi-plus text-sm" />
          </button>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
            title="Alejar"
            @click="zoomOut()"
          >
            <i class="pi pi-minus text-sm" />
          </button>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
            title="Encuadrar todo"
            @click="fitView({ padding: 0.2 })"
          >
            <i class="pi pi-expand text-sm" />
          </button>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
            title="Ordenar automáticamente"
            @click="applyAutoLayout"
          >
            <i class="pi pi-sparkles text-sm" />
          </button>
        </div>
      </div>

      <!-- Panel de edición -->
      <aside class="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
        <template v-if="selectedNode">
          <div class="flex items-center justify-between">
            <span
              class="rounded-md px-2 py-1 text-xs font-semibold text-slate-800"
              :style="{ backgroundColor: NODE_CATALOG[selectedNode.data!.def.type].headerBg }"
            >
              <i
                :class="NODE_CATALOG[selectedNode.data!.def.type].icon"
                class="mr-1 text-[11px]"
                :style="{ color: NODE_CATALOG[selectedNode.data!.def.type].accent }"
              />
              {{ NODE_CATALOG[selectedNode.data!.def.type].label }}
            </span>
            <div class="flex gap-1">
              <Button
                v-if="!selectedNode.data!.isStart"
                icon="pi pi-flag"
                text
                size="small"
                severity="secondary"
                title="Marcar como inicio del flujo"
                @click="markAsStart"
              />
              <Button
                icon="pi pi-clone"
                text
                size="small"
                severity="secondary"
                title="Duplicar nodo"
                @click="duplicateSelected"
              />
              <Button
                icon="pi pi-trash"
                text
                size="small"
                severity="danger"
                title="Eliminar nodo"
                @click="deleteSelected"
              />
            </div>
          </div>

          <!-- texto (nodos que envían) -->
          <div
            v-if="['message', 'buttons', 'cta_url'].includes(selectedNode.data!.def.type)"
            class="flex flex-col gap-1.5"
          >
            <label class="text-xs font-medium text-slate-600">
              Mensaje <span class="font-normal text-slate-400">(admite <code v-pre>{{variables}}</code>)</span>
            </label>
            <Textarea v-model="selectedNode.data!.def.text" rows="4" auto-resize fluid class="!text-sm" />
          </div>

          <!-- buttons -->
          <div v-if="selectedNode.data!.def.type === 'buttons'" class="flex flex-col gap-2">
            <label class="text-xs font-medium text-slate-600">Botones (máx. 3, regla de Meta)</label>
            <div
              v-for="(button, index) in selectedNode.data!.def.buttons"
              :key="button.id"
              class="flex items-center gap-1"
            >
              <InputText
                v-model="button.title"
                :placeholder="`Botón ${index + 1} (máx. 20 caract.)`"
                :maxlength="20"
                fluid
                class="!text-sm"
              />
              <Button
                icon="pi pi-times"
                text
                size="small"
                severity="secondary"
                :disabled="selectedNode.data!.def.buttons!.length <= 1"
                @click="removeButton(index)"
              />
            </div>
            <Button
              v-if="(selectedNode.data!.def.buttons?.length ?? 0) < 3"
              label="Agregar botón"
              icon="pi pi-plus"
              text
              size="small"
              @click="addButton"
            />
          </div>

          <!-- cta_url -->
          <template v-if="selectedNode.data!.def.type === 'cta_url'">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">URL a abrir</label>
              <InputText v-model="selectedNode.data!.def.url" placeholder="https://…" fluid class="!text-sm" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">Texto del botón</label>
              <InputText v-model="selectedNode.data!.def.button" placeholder="Abrir" fluid class="!text-sm" />
            </div>
          </template>

          <!-- condition -->
          <template v-if="selectedNode.data!.def.type === 'condition'">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">Evaluar</label>
              <Select
                v-model="conditionKind"
                :options="[
                  { label: 'Tiene el tag', value: 'tag' },
                  { label: 'NO tiene el tag', value: 'not_tag' },
                  { label: 'Un campo / variable', value: 'field' },
                ]"
                option-label="label"
                option-value="value"
                fluid
                class="!text-sm"
              />
            </div>
            <div v-if="conditionKind !== 'field'" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">Tag</label>
              <InputText
                :model-value="selectedNode.data!.def.when?.tag ?? selectedNode.data!.def.when?.not_tag ?? ''"
                placeholder="vip"
                fluid
                class="!text-sm"
                @update:model-value="
                  (v) => {
                    const when = selectedNode!.data!.def.when!
                    if (conditionKind === 'tag') when.tag = v ?? ''
                    else when.not_tag = v ?? ''
                  }
                "
              />
            </div>
            <template v-else>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">
                  Campo <span class="font-normal text-slate-400">(variable, contact.name o custom field)</span>
                </label>
                <InputText v-model="selectedNode.data!.def.when!.field" placeholder="sede" fluid class="!text-sm" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">Comparación</label>
                <Select
                  v-model="conditionOp"
                  :options="[
                    { label: 'es igual a', value: 'equals' },
                    { label: 'es distinto de', value: 'not_equals' },
                    { label: 'contiene', value: 'contains' },
                    { label: 'tiene valor', value: 'exists' },
                  ]"
                  option-label="label"
                  option-value="value"
                  fluid
                  class="!text-sm"
                />
              </div>
              <div v-if="conditionOp !== 'exists'" class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">Valor</label>
                <InputText v-model="conditionValue" fluid class="!text-sm" />
              </div>
            </template>
            <p class="text-[11px] leading-snug text-slate-400">
              Conecta la salida «Sí» y/o «No» a los siguientes nodos.
            </p>
          </template>

          <!-- delay -->
          <div v-if="selectedNode.data!.def.type === 'delay'" class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Esperar</label>
            <div class="flex gap-2">
              <InputNumber v-model="delayAmount" :min="1" :max="20160" class="w-24" fluid />
              <Select
                v-model="delayUnit"
                :options="[
                  { label: 'minutos', value: 1 },
                  { label: 'horas', value: 60 },
                  { label: 'días', value: 1440 },
                ]"
                option-label="label"
                option-value="value"
                class="flex-1"
              />
            </div>
            <p class="text-[11px] leading-snug text-slate-400">
              Máximo 14 días. Si el contacto arranca otro flujo mientras espera, este se cancela.
            </p>
          </div>

          <!-- efectos -->
          <div class="mt-2 border-t border-slate-100 pt-3">
            <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Efectos sobre el contacto
            </p>
            <div class="flex flex-col gap-2">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-slate-600">Agregar tags <span class="font-normal text-slate-400">(coma)</span></label>
                <InputText v-model="addTagsText" placeholder="pregunto_cancelacion" fluid class="!text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-slate-600">Quitar tags</label>
                <InputText v-model="removeTagsText" fluid class="!text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-slate-600">Fijar campos <span class="font-normal text-slate-400">(campo=valor por línea)</span></label>
                <Textarea v-model="setFieldsText" rows="2" auto-resize fluid class="!text-sm font-mono" />
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Flujo</p>
          <div v-if="!flowId" class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">App dueña</label>
            <Select v-model="metaApp" :options="appOptions" placeholder="App" fluid class="!text-sm" />
          </div>
          <div v-if="!flowId" class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Nombre</label>
            <InputText v-model="metaName" placeholder="post_agenda" fluid class="!text-sm" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Disparador</label>
            <SelectButton
              v-model="metaTrigger"
              :options="[
                { label: 'API', value: 'api' },
                { label: 'Keyword', value: 'keyword' },
              ]"
              option-label="label"
              option-value="value"
              :allow-empty="false"
            />
            <p class="text-[11px] leading-snug text-slate-400">
              API: tu app lo dispara (ej. al agendar una cita). Keyword: arranca cuando el cliente
              escribe una palabra clave.
            </p>
          </div>
          <div v-if="metaTrigger === 'keyword'" class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Palabras clave (coma)</label>
            <InputText v-model="metaKeywords" placeholder="ayuda, menu" fluid class="!text-sm" />
          </div>
          <p class="mt-2 border-t border-slate-100 pt-3 text-[11px] leading-snug text-slate-400">
            Haz clic en un nodo del canvas para editarlo aquí. El primer nodo que agregues queda
            como inicio; puedes cambiarlo con la banderita.
          </p>
        </template>
      </aside>
    </div>
  </div>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';

.nexolu-flow-canvas {
  background-color: #f8fafc;
  background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
  background-size: 20px 20px;
}
.nexolu-flow-canvas .vue-flow__edge-path {
  stroke: #94a3b8;
  stroke-width: 2;
}
.nexolu-flow-canvas .vue-flow__edge.selected .vue-flow__edge-path {
  stroke: #6366f1;
  stroke-width: 2.5;
}
</style>

<script setup lang="ts">
// El constructor de flujos de Nexolú Connect, a pantalla completa (patrón
// ManyChat): el canvas se queda con TODO el espacio; los nodos se agregan
// con el botón "+" flotante, con clic derecho en el lienzo, o soltando una
// conexión en el vacío (menú rápido que además conecta solo). El flujo
// arranca en el nodo "Cuando…" (disparador): su arista "Entonces" define
// el `start` — reconectarla cambia el inicio. La edición de un nodo abre
// un panel flotante a la izquierda. Serializa al MISMO JSON que valida el
// backend (ver builder/graph.ts); el editor JSON de FlowsView queda como
// modo avanzado.
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { VueFlow, useVueFlow, type Edge, type NodeMouseEvent } from '@vue-flow/core'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import ConnectWordmark from '@/ui/ConnectWordmark.vue'
import type { FlowDefinition, FlowNodeDef, FlowNodeType } from '@/types/flows'

import { createFlow, fetchFlows, updateFlow } from '../services/flowsService'
import FlowNodeCard from './FlowNodeCard.vue'
import TriggerNodeCard from './TriggerNodeCard.vue'
import {
  NODE_CATALOG,
  TRIGGER_NODE_ID,
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
const dirty = ref(false)

const metaName = ref('')
const metaApp = ref<string | null>(null)
const metaTrigger = ref<'api' | 'keyword'>('api')
const metaKeywords = ref('')
const saveError = ref<string | null>(null)

// Id explicito y compartido: los componentes internos de Vue Flow (Handle,
// etc.) resuelven su store por inyeccion/id — sin esto, con nodos custom
// via slots la instancia del composable puede quedar divorciada de la del
// canvas (bounds vacios, eventos de conexion mudos).
const vueFlowStore = useVueFlow('builder')
const {
  addEdges,
  removeEdges,
  updateNodeInternals,
  fitView,
  zoomIn,
  zoomOut,
  screenToFlowCoordinate,
  removeNodes,
  getEdges,
} = vueFlowStore

function triggerNode(position: { x: number; y: number }): BuilderNode {
  return {
    id: TRIGGER_NODE_ID,
    type: 'trigger',
    position,
    // El card lee triggerType/keywords; un watch los mantiene al dia.
    data: {
      triggerType: metaTrigger.value,
      keywords: splitList(metaKeywords.value),
    } as unknown as BuilderNode['data'],
  }
}

// Cargar el flujo a editar (o arrancar con solo el disparador para uno nuevo).
watch(
  [flows, flowId],
  () => {
    const key = flowId.value ?? '(nuevo)'
    if (loadedFor.value === key) return
    if (flowId.value) {
      const flow = (flows.value ?? []).find((f) => f.id === flowId.value)
      if (!flow) return
      const definition = flow.definition as unknown as FlowDefinition
      const graph = definitionToGraph(definition)
      metaName.value = flow.name
      metaApp.value = flow.app_id
      metaTrigger.value = flow.trigger_type
      metaKeywords.value = flow.trigger_keywords.join(', ')

      const startNode = graph.nodes.find((n) => n.id === definition.start)
      const savedPos = definition.ui?.positions?.[TRIGGER_NODE_ID]
      const trigger = triggerNode(
        savedPos ??
          (startNode
            ? { x: startNode.position.x - 320, y: startNode.position.y }
            : { x: 60, y: 120 }),
      )
      nodes.value = [trigger, ...graph.nodes]
      edges.value = definition.start
        ? [makeEdge(TRIGGER_NODE_ID, 'start', definition.start), ...graph.edges]
        : graph.edges
    } else {
      metaName.value = ''
      metaApp.value = appOptions.value.length === 1 ? appOptions.value[0] : null
      metaTrigger.value = 'api'
      metaKeywords.value = ''
      nodes.value = [triggerNode({ x: 60, y: 160 })]
      edges.value = []
      selectedId.value = TRIGGER_NODE_ID // el panel de configuración de una
    }
    loadedFor.value = key
    void nextTick(() => {
      // Kick de medicion: al REEMPLAZAR el array de nodos, Vue Flow re-parsea
      // sin re-montar los wrappers y los handleBounds quedan vacios (las
      // conexiones no arrancan). updateNodeInternals() los re-registra.
      updateNodeInternals()
      fitView({ padding: 0.25 })
      markClean()
    })
  },
  { immediate: true },
)

// El card del disparador refleja lo configurado, y el badge "Inicio" sigue
// a la arista del disparador.
watch([metaTrigger, metaKeywords], () => {
  const trigger = nodes.value.find((n) => n.id === TRIGGER_NODE_ID)
  if (trigger) {
    trigger.data = {
      triggerType: metaTrigger.value,
      keywords: splitList(metaKeywords.value),
    } as unknown as BuilderNode['data']
  }
})

watch(
  edges,
  () => {
    const startId = edges.value.find((e) => e.source === TRIGGER_NODE_ID)?.target ?? null
    for (const node of nodes.value) {
      if (node.id !== TRIGGER_NODE_ID && node.data) {
        node.data.isStart = node.id === startId
      }
    }
  },
  { deep: true },
)

// Cambios sin guardar: por comparación de contenido (la serialización que
// se guardaría), no por "algo se movió" — Vue Flow muta internamente los
// nodos (dimensiones, bounds) y eso NO es un cambio del usuario.
const cleanSnapshot = ref('')

function snapshot(): string {
  return JSON.stringify({
    definition: graphToDefinition(nodes.value, edges.value),
    trigger: metaTrigger.value,
    keywords: metaKeywords.value,
    name: metaName.value,
  })
}

function markClean(): void {
  cleanSnapshot.value = snapshot()
  dirty.value = false
}

watch(
  [nodes, edges, metaTrigger, metaKeywords, metaName],
  () => (dirty.value = snapshot() !== cleanSnapshot.value),
  { deep: true },
)

// --- conexiones ---------------------------------------------------------------

function connectHandles(source: string, sourceHandle: string, target: string): void {
  if (target === TRIGGER_NODE_ID || source === target) return
  // Una sola salida por handle: reconectar reemplaza la arista anterior.
  // OJO: quitar por el store (removeEdges), no filtrando nuestro ref — el
  // v-model de Vue Flow re-emite su lista interna y pisaria el filtro.
  const stale = getEdges.value.filter(
    (e) => e.source === source && e.sourceHandle === sourceHandle,
  )
  if (stale.length > 0) removeEdges(stale.map((e) => e.id))
  addEdges([makeEdge(source, sourceHandle, target)])
}

const pendingConnect = ref<{ nodeId: string; handleId: string } | null>(null)

// Los manejadores de conexión van como EVENTOS del componente (@connect-*
// en el template), no como hooks del composable: en esta vista los hooks
// de useVueFlow() no llegan a la instancia (los eventos sí — verificado
// con @pane-context-menu), y addEdges/getEdges sí operan el store.

function onConnectStartEvent(params: { nodeId?: string | null; handleId?: string | null }): void {
  if (params.nodeId && params.handleId) {
    pendingConnect.value = { nodeId: params.nodeId, handleId: params.handleId }
  }
}

function onConnectEvent(connection: { source: string; sourceHandle?: string | null; target: string }): void {
  pendingConnect.value = null
  if (!connection.sourceHandle) return
  connectHandles(connection.source, connection.sourceHandle, connection.target)
}

// Soltar la conexión en el vacío (patrón ManyChat): menú rápido que crea
// el nodo Y lo conecta de una.
function onConnectEndEvent(event?: MouseEvent | TouchEvent): void {
  const source = pendingConnect.value
  pendingConnect.value = null
  if (!source || !(event instanceof MouseEvent)) return
  const target = event.target as Element | null
  if (!target?.closest('.vue-flow__pane')) return
  openQuickMenu(event.clientX, event.clientY, source)
}

// --- menú rápido de nodos -----------------------------------------------------

const quickMenu = ref<{
  x: number
  y: number
  flow: { x: number; y: number }
  source: { nodeId: string; handleId: string } | null
} | null>(null)

function openQuickMenu(
  clientX: number,
  clientY: number,
  source: { nodeId: string; handleId: string } | null,
): void {
  quickMenu.value = {
    // fixed sobre la pantalla completa; que no se salga por abajo/derecha.
    x: Math.min(clientX, window.innerWidth - 240),
    y: Math.min(clientY, window.innerHeight - 320),
    flow: screenToFlowCoordinate({ x: clientX, y: clientY }),
    source,
  }
}

function onPaneContextMenu(event: MouseEvent): void {
  event.preventDefault()
  openQuickMenu(event.clientX, event.clientY, null)
}

function onPaneClick(): void {
  selectedId.value = null
  quickMenu.value = null
}

function openFabMenu(event: MouseEvent): void {
  openQuickMenu(event.clientX - 220, event.clientY - 300, null)
}

function addNode(type: FlowNodeType, position: { x: number; y: number }): string {
  const ids = new Set<string>()
  for (const existing of nodes.value) ids.add(existing.id)
  const id = newNodeId(ids)
  const node: BuilderNode = {
    id,
    type: 'flow',
    position,
    data: { def: defaultNodeDef(type), isStart: false },
  }
  nodes.value = [...nodes.value, node]
  return id
}

function addFromQuickMenu(type: FlowNodeType): void {
  const menu = quickMenu.value
  if (!menu) return
  quickMenu.value = null
  const id = addNode(type, menu.flow)
  // La arista va en nextTick: addEdges valida que el nodo destino exista
  // en el store, y el recien agregado se parsea al final de este tick.
  void nextTick(() => {
    if (menu.source) {
      connectHandles(menu.source.nodeId, menu.source.handleId, id)
    } else if (!edges.value.some((e) => e.source === TRIGGER_NODE_ID)) {
      // Primer nodo de contenido: engancharlo al disparador de una.
      connectHandles(TRIGGER_NODE_ID, 'start', id)
    }
  })
  selectedId.value = id
}

// --- controles del canvas -----------------------------------------------------

function applyAutoLayout(): void {
  const definition = graphToDefinition(nodes.value, edges.value)
  const positions = autoLayout(definition)
  for (const node of nodes.value) {
    if (node.id === TRIGGER_NODE_ID) {
      node.position = { x: 40, y: 80 }
      continue
    }
    const position = positions[node.id]
    if (position) node.position = { x: position.x + 380, y: position.y + 80 }
  }
  void nextTick(() => fitView({ padding: 0.25 }))
}

// --- selección y edición ------------------------------------------------------

const selectedNode = computed(() => {
  if (!selectedId.value || selectedId.value === TRIGGER_NODE_ID) return null
  return nodes.value.find((n) => n.id === selectedId.value) ?? null
})

// 'trigger' = configuración del flujo (disparador + app/nombre si es nuevo).
const panelMode = computed<'node' | 'trigger' | null>(() => {
  if (selectedId.value === TRIGGER_NODE_ID) return 'trigger'
  if (selectedNode.value) return 'node'
  return null
})

function onNodeClick({ node }: NodeMouseEvent): void {
  selectedId.value = node.id
}

function closePanel(): void {
  selectedId.value = null
}

function deleteSelected(): void {
  if (!selectedId.value || selectedId.value === TRIGGER_NODE_ID) return
  removeNodes([selectedId.value], true)
  nodes.value = nodes.value.filter((n) => n.id !== selectedId.value)
  edges.value = edges.value.filter(
    (e) => e.source !== selectedId.value && e.target !== selectedId.value,
  )
  selectedId.value = null
}

function duplicateSelected(): void {
  const source = selectedNode.value
  if (!source) return
  const def = JSON.parse(JSON.stringify(source.data!.def)) as FlowNodeDef
  const id = addNode(def.type, { x: source.position.x + 40, y: source.position.y + 40 })
  const copy = nodes.value.find((n) => n.id === id)
  if (copy?.data) copy.data.def = def
  selectedId.value = id
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
    markClean()
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
  const contentNodes = nodes.value.filter((n) => n.id !== TRIGGER_NODE_ID)
  if (contentNodes.length === 0) {
    saveError.value = 'Agrega al menos un nodo con el botón + o con clic derecho en el lienzo.'
    return
  }
  if (!flowId.value) {
    if (!metaApp.value) {
      saveError.value = 'Elige la app dueña del flujo (clic en el nodo «Cuando…»).'
      selectedId.value = TRIGGER_NODE_ID
      return
    }
    if (!/^[a-z0-9_-]+$/.test(metaName.value.trim())) {
      saveError.value = 'El nombre va en minúsculas, números, guion y guion bajo (ej: post_agenda).'
      selectedId.value = TRIGGER_NODE_ID
      return
    }
  }
  saveMutation.mutate()
}

const menuTypes = Object.entries(NODE_CATALOG) as [
  FlowNodeType,
  (typeof NODE_CATALOG)[FlowNodeType],
][]
</script>

<template>
  <div class="flex h-screen flex-col bg-white">
    <!-- Barra superior compacta -->
    <header class="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3">
      <Button
        icon="pi pi-arrow-left"
        text
        severity="secondary"
        title="Volver a flujos"
        @click="router.push({ name: 'flows' })"
      />
      <ConnectWordmark compact />
      <span class="h-6 w-px bg-slate-200" />
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-sm text-slate-400">Flujos /</span>
        <InputText
          v-if="!flowId"
          v-model="metaName"
          placeholder="nombre_del_flujo"
          class="!h-8 w-52 !text-sm font-semibold"
        />
        <span v-else class="truncate text-sm font-bold text-slate-900">{{ metaName }}</span>
        <span
          v-if="!flowId && metaApp"
          class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500"
        >
          {{ metaApp }}
        </span>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <span
          v-if="saveError"
          class="max-w-md truncate rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
          :title="saveError"
        >
          {{ saveError }}
        </span>
        <span
          v-else
          class="flex items-center gap-1.5 text-xs font-medium"
          :class="dirty ? 'text-amber-600' : 'text-slate-400'"
        >
          <i :class="dirty ? 'pi pi-circle-fill text-[8px]' : 'pi pi-check'" />
          {{ dirty ? 'Cambios sin guardar' : 'Guardado' }}
        </span>
        <Button
          icon="pi pi-bolt"
          text
          severity="secondary"
          title="Configurar disparador"
          @click="selectedId = TRIGGER_NODE_ID"
        />
        <Button
          label="Guardar"
          icon="pi pi-check"
          size="small"
          :loading="saveMutation.isPending.value"
          @click="save"
        />
      </div>
    </header>

    <!-- Canvas a pantalla completa -->
    <div class="relative min-h-0 flex-1">
      <VueFlow
        id="builder"
        v-model:nodes="nodes"
        v-model:edges="edges"
        :delete-key-code="['Backspace', 'Delete']"
        :min-zoom="0.3"
        :max-zoom="1.6"
        :zoom-on-double-click="false"
        fit-view-on-init
        class="nexolu-flow-canvas"
        @node-click="onNodeClick"
        @pane-click="onPaneClick"
        @pane-context-menu="onPaneContextMenu"
        @connect-start="onConnectStartEvent"
        @connect="onConnectEvent"
        @connect-end="onConnectEndEvent"
      >
        <template #node-flow="props">
          <FlowNodeCard :id="props.id" :data="props.data" :selected="props.id === selectedId" />
        </template>
        <template #node-trigger="props">
          <TriggerNodeCard :id="props.id" :data="props.data" :selected="props.id === selectedId" />
        </template>
      </VueFlow>

      <!-- FAB agregar nodo -->
      <button
        type="button"
        class="absolute bottom-6 right-4 z-10 flex h-13 w-13 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-teal-500"
        style="height: 3.25rem; width: 3.25rem"
        title="Agregar nodo"
        @click="openFabMenu"
      >
        <i class="pi pi-plus text-xl" />
      </button>

      <!-- Rail de controles -->
      <div class="absolute right-4 top-4 z-10 flex flex-col gap-1.5">
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
          @click="fitView({ padding: 0.25 })"
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

      <!-- Menú rápido (FAB, clic derecho, o soltar una conexión al vacío) -->
      <div
        v-if="quickMenu"
        class="fixed z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        :style="{ left: `${quickMenu.x}px`, top: `${quickMenu.y}px` }"
      >
        <p class="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {{ quickMenu.source ? 'Continuar con…' : 'Agregar nodo' }}
        </p>
        <button
          v-for="[type, item] in menuTypes"
          :key="type"
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-slate-50"
          @click="addFromQuickMenu(type)"
        >
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            :style="{ backgroundColor: item.headerBg }"
          >
            <i :class="item.icon" class="text-xs" :style="{ color: item.accent }" />
          </span>
          <span class="min-w-0">
            <span class="block text-[13px] font-medium text-slate-800">{{ item.label }}</span>
            <span class="block truncate text-[11px] text-slate-400">{{ item.description }}</span>
          </span>
        </button>
        <button
          type="button"
          class="w-full border-t border-slate-100 px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-50"
          @click="quickMenu = null"
        >
          Cancelar
        </button>
      </div>

      <!-- Panel flotante de edición (izquierda, patrón ManyChat) -->
      <aside
        v-if="panelMode"
        class="absolute bottom-0 left-0 top-0 z-20 flex w-[340px] flex-col border-r border-slate-200 bg-white shadow-xl"
      >
        <!-- nodo seleccionado -->
        <template v-if="panelMode === 'node' && selectedNode">
          <div
            class="flex items-center gap-2 px-4 py-3"
            :style="{ backgroundColor: NODE_CATALOG[selectedNode.data!.def.type].headerBg }"
          >
            <i
              :class="NODE_CATALOG[selectedNode.data!.def.type].icon"
              class="text-sm"
              :style="{ color: NODE_CATALOG[selectedNode.data!.def.type].accent }"
            />
            <span class="text-sm font-bold text-slate-800">
              {{ NODE_CATALOG[selectedNode.data!.def.type].label }}
            </span>
            <div class="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                class="rounded p-1.5 text-slate-500 hover:bg-white/60 hover:text-slate-800"
                title="Duplicar nodo"
                @click="duplicateSelected"
              >
                <i class="pi pi-clone text-xs" />
              </button>
              <button
                type="button"
                class="rounded p-1.5 text-slate-500 hover:bg-white/60 hover:text-red-600"
                title="Eliminar nodo"
                @click="deleteSelected"
              >
                <i class="pi pi-trash text-xs" />
              </button>
              <button
                type="button"
                class="rounded p-1.5 text-slate-500 hover:bg-white/60 hover:text-slate-800"
                title="Cerrar"
                @click="closePanel"
              >
                <i class="pi pi-times text-xs" />
              </button>
            </div>
          </div>

          <div class="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            <!-- texto (nodos que envían) -->
            <div
              v-if="['message', 'buttons', 'cta_url'].includes(selectedNode.data!.def.type)"
              class="flex flex-col gap-1.5"
            >
              <label class="text-xs font-medium text-slate-600">
                Mensaje
                <span class="font-normal text-slate-400">(admite <code v-pre>{{variables}}</code>)</span>
              </label>
              <Textarea
                v-model="selectedNode.data!.def.text"
                rows="4"
                auto-resize
                fluid
                class="!text-sm"
              />
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
                Conecta la salida <span class="font-medium text-green-600">Sí</span> y/o
                <span class="font-medium text-red-500">No</span> a los siguientes nodos.
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
          </div>
        </template>

        <!-- disparador / configuración del flujo -->
        <template v-else>
          <div class="flex items-center gap-2 bg-slate-900 px-4 py-3">
            <i class="pi pi-bolt text-sm text-amber-400" />
            <span class="text-sm font-bold text-white">Cuando…</span>
            <button
              type="button"
              class="ml-auto rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              title="Cerrar"
              @click="closePanel"
            >
              <i class="pi pi-times text-xs" />
            </button>
          </div>

          <div class="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            <div v-if="!flowId" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">App dueña</label>
              <Select v-model="metaApp" :options="appOptions" placeholder="App" fluid class="!text-sm" />
            </div>
            <div v-if="!flowId" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">Nombre del flujo</label>
              <InputText v-model="metaName" placeholder="post_agenda" fluid class="!text-sm" />
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">El flujo arranca cuando…</label>
              <SelectButton
                v-model="metaTrigger"
                :options="[
                  { label: 'Tu app lo dispara (API)', value: 'api' },
                  { label: 'Palabra clave', value: 'keyword' },
                ]"
                option-label="label"
                option-value="value"
                :allow-empty="false"
              />
              <p class="text-[11px] leading-snug text-slate-400">
                API: por ejemplo, al agendar una cita (<code>POST /v1/flows/trigger</code>).
                Keyword: cuando el cliente escribe una de las palabras.
              </p>
            </div>
            <div v-if="metaTrigger === 'keyword'" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">Palabras clave (coma)</label>
              <InputText v-model="metaKeywords" placeholder="ayuda, menu" fluid class="!text-sm" />
            </div>

            <p class="mt-2 border-t border-slate-100 pt-3 text-[11px] leading-snug text-slate-400">
              La flecha «Entonces» del nodo Cuando… marca por dónde arranca el flujo — reconéctala
              para cambiar el inicio. Agrega nodos con el botón
              <span class="font-medium text-teal-600">+</span>, con clic derecho en el lienzo, o
              soltando una conexión en el vacío.
            </p>
          </div>
        </template>
      </aside>
    </div>
  </div>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';

.nexolu-flow-canvas {
  background-color: #fafbfc;
  background-image: radial-gradient(#d8dee6 1px, transparent 1px);
  background-size: 22px 22px;
}
.nexolu-flow-canvas .vue-flow__edge-path {
  stroke: #94a3b8;
  stroke-width: 2;
}
.nexolu-flow-canvas .vue-flow__edge.selected .vue-flow__edge-path {
  stroke: #0d9488;
  stroke-width: 2.5;
}
</style>

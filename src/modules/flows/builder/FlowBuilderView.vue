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
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { fetchCatalogItems } from '@/modules/catalog/services/catalogService'
import { fetchCommsApps } from '@/modules/commsCore/services/commsCoreService'
import { fetchTemplates } from '@/modules/templates/services/templatesService'
import TemplatePreview from '@/modules/templates/components/TemplatePreview.vue'
import ConnectWordmark from '@/ui/ConnectWordmark.vue'
import type { BlockType, FlowDefinition, FlowNodeDef, FlowNodeType, MessageBlock } from '@/types/flows'
import type { WhatsAppTemplate } from '@/types/templates'

import { createFlow, fetchFlows, updateFlow } from '../services/flowsService'
import FlowNodeCard from './FlowNodeCard.vue'
import SimulatorPanel from './SimulatorPanel.vue'
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

// Plantillas del espejo, para el nodo `template` (elegir por nombre y
// previsualizar el cuerpo real).
const { data: allTemplates } = useQuery({
  queryKey: ['whatsapp-templates'] as const,
  queryFn: () => fetchTemplates(),
})

// Items del catalogo, para el nodo `product` (elegir por titulo en vez de
// escribir retailer_ids a mano).
const { data: allCatalogItems } = useQuery({
  queryKey: ['catalog-items'] as const,
  queryFn: () => fetchCatalogItems(),
})

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
  // fixed sobre la pantalla completa; que no se salga por abajo/derecha.
  // El menu ademas tiene max-height con scroll propio (ver template) para
  // pantallas bajas: ninguna opcion puede quedar inalcanzable.
  const menuHeight = Math.min(460, window.innerHeight * 0.8)
  quickMenu.value = {
    x: Math.min(clientX, window.innerWidth - 240),
    y: Math.max(8, Math.min(clientY, window.innerHeight - menuHeight - 12)),
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

// Filas del mensaje de lista: mismo baile que los botones (los handles
// cambian, hay que re-registrarlos).
function addRow(): void {
  const def = selectedNode.value?.data?.def
  if (!def?.rows || def.rows.length >= 10) return
  def.rows.push({ id: newButtonId(def.rows), title: '' })
  void nextTick(() => updateNodeInternals([selectedId.value!]))
}

function removeRow(index: number): void {
  const def = selectedNode.value?.data?.def
  if (!def?.rows) return
  const [removed] = def.rows.splice(index, 1)
  edges.value = edges.value.filter(
    (e) => !(e.source === selectedId.value && e.sourceHandle === `row:${removed.id}`),
  )
  void nextTick(() => updateNodeInternals([selectedId.value!]))
}

// Ramas del aleatorizador (2-5). Quitar una recorre los indices de los
// handles: las aristas de ramas posteriores se re-indexan.
function addBranch(): void {
  const def = selectedNode.value?.data?.def
  if (!def?.branches || def.branches.length >= 5) return
  def.branches.push({ weight: 50 })
  void nextTick(() => updateNodeInternals([selectedId.value!]))
}

function removeBranch(index: number): void {
  const def = selectedNode.value?.data?.def
  if (!def?.branches || def.branches.length <= 2) return
  def.branches.splice(index, 1)
  edges.value = edges.value
    .filter((e) => !(e.source === selectedId.value && e.sourceHandle === `br:${index}`))
    .map((e) => {
      if (e.source !== selectedId.value || !e.sourceHandle?.startsWith('br:')) return e
      const branchIndex = Number(e.sourceHandle.slice(3))
      return branchIndex > index
        ? makeEdge(e.source, `br:${branchIndex - 1}`, e.target)
        : e
    })
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

// --- vista previa (simulador) -------------------------------------------------

const simDefinition = ref<FlowDefinition | null>(null)

function toggleSimulator(): void {
  // Foto de la definicion al abrir: editar el canvas no reinicia el ensayo
  // a mitad de camino; "Probar" de nuevo (o Reiniciar) toma los cambios.
  simDefinition.value = simDefinition.value
    ? null
    : (JSON.parse(JSON.stringify(graphToDefinition(nodes.value, edges.value))) as FlowDefinition)
}

// Las {{variables}} que usa la definicion (menos contact.*): el hint del
// panel para llenar el contexto del ensayo.
const simVariablesHint = computed(() => {
  if (!simDefinition.value) return []
  const found = new Set<string>()
  for (const match of JSON.stringify(simDefinition.value).matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
    if (!match[1].startsWith('contact.')) found.add(match[1])
  }
  return [...found]
})

// Las variables disponibles para insertar en un texto (patron ManyChat:
// chips bajo el editor): contact.name, los campos que capturan los nodos
// `capture` del propio flujo, y toda {{variable}} ya usada en el lienzo.
const availableVariables = computed(() => {
  const found = new Set<string>(['contact.name'])
  for (const node of nodes.value) {
    const def = node.data && 'def' in node.data ? (node.data as { def?: FlowNodeDef }).def : null
    if (!def) continue
    if (def.type === 'capture' && def.field) found.add(`contact.fields.${def.field}`)
    for (const match of JSON.stringify(def).matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
      found.add(match[1])
    }
  }
  return [...found]
})

function insertVariable(path: string): void {
  const def = selectedNode.value?.data?.def
  if (!def) return
  def.text = `${def.text ?? ''}{{${path}}}`
}

// --- nodo template ------------------------------------------------------------

const templateOptions = computed(() =>
  (allTemplates.value ?? [])
    .filter((t) => !metaApp.value || t.app_id === metaApp.value)
    .map((t) => ({
      label: `${t.name} · ${t.language}${t.status === 'APPROVED' ? '' : ` (${t.status})`}`,
      value: `${t.name}|${t.language}`,
      template: t,
    })),
)

const selectedTemplate = computed<WhatsAppTemplate | null>(() => {
  const def = selectedNode.value?.data?.def
  if (def?.type !== 'template' || !def.template) return null
  return (
    (allTemplates.value ?? []).find(
      (t) => t.name === def.template && t.language === (def.language || 'es'),
    ) ?? null
  )
})

function templateParamCount(template: WhatsAppTemplate): number {
  const body = template.components.find((c) => String(c.type).toUpperCase() === 'BODY')
  const text = typeof body?.text === 'string' ? body.text : ''
  let max = 0
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(match[1]))
  return max
}

const templateChoice = computed({
  get(): string | null {
    const def = selectedNode.value?.data?.def
    return def?.template ? `${def.template}|${def.language || 'es'}` : null
  },
  set(value: string | null) {
    const def = selectedNode.value?.data?.def
    if (!def || !value) return
    const [name, language] = value.split('|')
    def.template = name
    def.language = language
    const chosen = (allTemplates.value ?? []).find(
      (t) => t.name === name && t.language === language,
    )
    const count = chosen ? templateParamCount(chosen) : 0
    const params = [...(def.params ?? [])]
    params.length = count
    def.params = params.map((p) => p ?? '')
  },
})

// --- nodo blocks: el editor "Enviar mensaje" (calcado de ManyChat) ------------

// Los bloques de contenido que se pueden añadir. `primary` va siempre a la
// vista; el resto vive detras de "Más" (mismo patron del referente).
const BLOCK_CATALOG: {
  type: BlockType
  label: string
  icon: string
  description: string
  primary: boolean
}[] = [
  { type: 'text', label: 'Texto', icon: 'pi pi-align-left', description: 'Añadir texto y botones simples', primary: true },
  { type: 'image', label: 'Imagen', icon: 'pi pi-image', description: 'Aumentar la participación con elementos visuales', primary: true },
  { type: 'wait', label: 'Retraso', icon: 'pi pi-clock', description: 'Espera unos segundos entre los textos', primary: true },
  { type: 'capture', label: 'Recopilación de datos', icon: 'pi pi-inbox', description: 'Recopila correos, teléfonos y más', primary: true },
  { type: 'document', label: 'Archivo', icon: 'pi pi-paperclip', description: 'Añadir archivos al mensaje', primary: false },
  { type: 'audio', label: 'Audio', icon: 'pi pi-volume-up', description: 'Envía fragmentos de voz en el chat', primary: false },
  { type: 'video', label: 'Video', icon: 'pi pi-video', description: 'Compartir video en el chat', primary: false },
  { type: 'list', label: 'Mensaje de lista', icon: 'pi pi-bars', description: 'Crea un menú con opciones', primary: false },
  { type: 'cta', label: 'Abrir link', icon: 'pi pi-external-link', description: 'Botón que abre una URL', primary: false },
]

const showMoreBlocks = ref(false)

function nodeOptionIds(def: FlowNodeDef): { id: string }[] {
  return (def.blocks ?? []).flatMap((b) => [...(b.buttons ?? []), ...(b.rows ?? [])])
}

// list/capture esperan respuesta: van de ULTIMOS y solo puede haber uno.
const hasTerminalBlock = computed(() =>
  (selectedNode.value?.data?.def.blocks ?? []).some((b) => ['list', 'capture'].includes(b.type)),
)
const hasButtonBlocks = computed(() =>
  (selectedNode.value?.data?.def.blocks ?? []).some((b) => (b.buttons ?? []).length > 0),
)

function defaultBlock(type: BlockType): MessageBlock {
  switch (type) {
    case 'text':
      return { type, text: '' }
    case 'cta':
      return { type, text: '', url: 'https://', button: 'Abrir' }
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return { type, url: 'https://' }
    case 'wait':
      return { type, seconds: 2 }
    case 'capture':
      return { type, text: '', field: '' }
    case 'list':
      return { type, text: '', button: 'Ver opciones', rows: [{ id: 'opcion_1', title: '' }] }
  }
}

function addBlock(type: BlockType): void {
  const def = selectedNode.value?.data?.def
  if (!def?.blocks || def.blocks.length >= 10) return
  if (['list', 'capture'].includes(type) && hasTerminalBlock.value) return
  if (type === 'capture' && hasButtonBlocks.value) return
  const block = defaultBlock(type)
  if (block.type === 'list') {
    block.rows = [{ id: newButtonId(nodeOptionIds(def)), title: '' }]
  }
  // Los bloques normales entran ANTES del list/capture final; los
  // terminales, de ultimos.
  const terminalIndex = def.blocks.findIndex((b) => ['list', 'capture'].includes(b.type))
  if (['list', 'capture'].includes(type) || terminalIndex === -1) def.blocks.push(block)
  else def.blocks.splice(terminalIndex, 0, block)
  showMoreBlocks.value = false
  void nextTick(() => updateNodeInternals([selectedId.value!]))
}

function removeBlock(index: number): void {
  const def = selectedNode.value?.data?.def
  if (!def?.blocks || def.blocks.length <= 1) return
  const [removed] = def.blocks.splice(index, 1)
  const gone = new Set(
    [...(removed.buttons ?? []).map((b) => `btn:${b.id}`), ...(removed.rows ?? []).map((r) => `row:${r.id}`)],
  )
  if (gone.size) {
    edges.value = edges.value.filter(
      (e) => !(e.source === selectedId.value && e.sourceHandle && gone.has(e.sourceHandle)),
    )
  }
  void nextTick(() => updateNodeInternals([selectedId.value!]))
}

function moveBlock(index: number, delta: -1 | 1): void {
  const def = selectedNode.value?.data?.def
  if (!def?.blocks) return
  const target = index + delta
  if (target < 0 || target >= def.blocks.length) return
  // Un terminal no se mueve de ultimo, y nada pasa por encima de el.
  if (['list', 'capture'].includes(def.blocks[index].type)) return
  if (['list', 'capture'].includes(def.blocks[target].type)) return
  ;[def.blocks[index], def.blocks[target]] = [def.blocks[target], def.blocks[index]]
  void nextTick(() => updateNodeInternals([selectedId.value!]))
}

function addBlockOption(block: MessageBlock, kind: 'buttons' | 'rows'): void {
  const def = selectedNode.value?.data?.def
  if (!def) return
  const list = (block[kind] ??= [])
  const max = kind === 'buttons' ? 3 : 10
  if (list.length >= max) return
  list.push({ id: newButtonId(nodeOptionIds(def)), title: '' })
  void nextTick(() => updateNodeInternals([selectedId.value!]))
}

function removeBlockOption(block: MessageBlock, kind: 'buttons' | 'rows', index: number): void {
  const list = block[kind]
  if (!list) return
  const [removed] = list.splice(index, 1)
  const handle = `${kind === 'buttons' ? 'btn' : 'row'}:${removed.id}`
  edges.value = edges.value.filter(
    (e) => !(e.source === selectedId.value && e.sourceHandle === handle),
  )
  void nextTick(() => updateNodeInternals([selectedId.value!]))
}

function insertVariableInto(block: MessageBlock, path: string): void {
  block.text = `${block.text ?? ''}{{${path}}}`
}

function blockMeta(type: BlockType) {
  return BLOCK_CATALOG.find((b) => b.type === type)!
}

// --- nodo product -------------------------------------------------------------

const catalogItemOptions = computed(() =>
  (allCatalogItems.value ?? [])
    .filter((item) => !metaApp.value || item.app_id === metaApp.value)
    .map((item) => ({ label: `${item.title} · ${item.retailer_id}`, value: item.retailer_id })),
)

// Uno (SPM) o varios (MPM): el modo lo define si el nodo tiene `sections`.
const productMode = computed({
  get(): 'single' | 'multi' {
    return selectedNode.value?.data?.def.sections ? 'multi' : 'single'
  },
  set(mode: 'single' | 'multi') {
    const def = selectedNode.value?.data?.def
    if (!def) return
    if (mode === 'multi') {
      def.sections = def.sections ?? [
        { title: 'Destacados', retailer_ids: def.retailer_id ? [def.retailer_id] : [] },
      ]
      delete def.retailer_id
    } else {
      def.retailer_id = def.sections?.[0]?.retailer_ids[0] ?? ''
      delete def.sections
      delete def.header
    }
  },
})

function addSection(): void {
  const def = selectedNode.value?.data?.def
  if (!def?.sections || def.sections.length >= 10) return
  def.sections.push({ title: '', retailer_ids: [] })
}

function removeSection(index: number): void {
  const def = selectedNode.value?.data?.def
  if (!def?.sections || def.sections.length <= 1) return
  def.sections.splice(index, 1)
}

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

// El menu de nodos muestra el paso "Enviar mensaje" (blocks) y la logica;
// los nodos granulares viejos (message/buttons/media/list/capture/cta_url)
// siguen soportados por el motor y se editan si ya existen, pero no se
// ofrecen: todo eso ahora son bloques DENTRO de Enviar mensaje.
const MENU_HIDDEN: FlowNodeType[] = ['message', 'buttons', 'cta_url', 'media', 'list', 'capture']
const menuTypes = (
  Object.entries(NODE_CATALOG) as [FlowNodeType, (typeof NODE_CATALOG)[FlowNodeType]][]
).filter(([type]) => !MENU_HIDDEN.includes(type))
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
          :label="simDefinition ? 'Cerrar prueba' : 'Probar'"
          :icon="simDefinition ? 'pi pi-stop-circle' : 'pi pi-play-circle'"
          size="small"
          severity="secondary"
          :outlined="!simDefinition"
          @click="toggleSimulator"
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
        class="fixed z-30 flex max-h-[80vh] w-56 flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
        :style="{ left: `${quickMenu.x}px`, top: `${quickMenu.y}px` }"
      >
        <p class="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {{ quickMenu.source ? 'Continuar con…' : 'Agregar nodo' }}
        </p>
        <button
          v-for="[type, item] in menuTypes"
          :key="type"
          type="button"
          class="flex w-full shrink-0 items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-slate-50"
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
          class="w-full shrink-0 border-t border-slate-100 px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-50"
          @click="quickMenu = null"
        >
          Cancelar
        </button>
      </div>

      <!-- Vista previa (derecha): el chat simulado del flujo -->
      <SimulatorPanel
        v-if="simDefinition"
        :definition="simDefinition"
        :templates="allTemplates ?? []"
        :variables-hint="simVariablesHint"
        @close="simDefinition = null"
      />

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
            <!-- nodo blocks: el paso "Enviar mensaje" con su pila de bloques -->
            <template v-if="selectedNode.data!.def.type === 'blocks'">
              <div class="flex flex-col gap-1.5">
                <InputText
                  v-model="selectedNode.data!.def.title"
                  placeholder="Enviar mensaje"
                  fluid
                  class="!text-sm font-semibold"
                />
                <p class="text-[11px] text-slate-400">
                  Enviar <span class="text-teal-600">dentro de la ventana de 24 horas</span>
                  <i class="pi pi-question-circle ml-1" title="Los mensajes de sesión solo entregan si la clienta escribió en las últimas 24h. Para reabrir la conversación usa el paso Plantilla." />
                </p>
              </div>

              <div
                v-for="(block, bIndex) in selectedNode.data!.def.blocks"
                :key="bIndex"
                class="flex flex-col gap-2 rounded-xl border border-slate-200 p-2.5"
              >
                <div class="flex items-center gap-1.5">
                  <i :class="blockMeta(block.type).icon" class="text-[11px] text-slate-400" />
                  <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {{ blockMeta(block.type).label }}
                  </span>
                  <div class="ml-auto flex">
                    <button type="button" class="rounded p-1 text-slate-300 hover:text-slate-600" title="Subir" @click="moveBlock(bIndex, -1)">
                      <i class="pi pi-chevron-up text-[10px]" />
                    </button>
                    <button type="button" class="rounded p-1 text-slate-300 hover:text-slate-600" title="Bajar" @click="moveBlock(bIndex, 1)">
                      <i class="pi pi-chevron-down text-[10px]" />
                    </button>
                    <button
                      type="button"
                      class="rounded p-1 text-slate-300 hover:text-red-500"
                      title="Quitar bloque"
                      :disabled="selectedNode.data!.def.blocks!.length <= 1"
                      @click="removeBlock(bIndex)"
                    >
                      <i class="pi pi-times text-[10px]" />
                    </button>
                  </div>
                </div>

                <!-- texto / cta / capture / list: el mensaje -->
                <template v-if="['text', 'cta', 'capture', 'list'].includes(block.type)">
                  <Textarea v-model="block.text" rows="3" auto-resize fluid class="!text-sm" placeholder="Escribe el mensaje…" />
                  <div class="flex flex-wrap items-center gap-1">
                    <button
                      v-for="variable in availableVariables"
                      :key="variable"
                      type="button"
                      class="rounded bg-teal-600/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 hover:bg-teal-600/20"
                      :title="`{{${variable}}}`"
                      @click="insertVariableInto(block, variable)"
                    >
                      {{ variable.split('.').pop() }}
                    </button>
                  </div>
                </template>

                <!-- botones del bloque de texto -->
                <template v-if="block.type === 'text'">
                  <div
                    v-for="(button, btnIndex) in block.buttons ?? []"
                    :key="button.id"
                    class="flex items-center gap-1"
                  >
                    <InputText v-model="button.title" placeholder="Título del botón (máx. 20)" :maxlength="20" fluid class="!text-sm" />
                    <Button icon="pi pi-times" text size="small" severity="secondary" @click="removeBlockOption(block, 'buttons', btnIndex)" />
                  </div>
                  <button
                    v-if="(block.buttons?.length ?? 0) < 3 && !hasTerminalBlock"
                    type="button"
                    class="rounded-lg border border-dashed border-slate-300 py-1.5 text-center text-xs text-slate-500 hover:border-teal-400 hover:text-teal-600"
                    @click="addBlockOption(block, 'buttons')"
                  >
                    + Añadir botón
                  </button>
                </template>

                <!-- cta -->
                <template v-if="block.type === 'cta'">
                  <InputText v-model="block.url" placeholder="https://…" fluid class="!text-sm" />
                  <InputText v-model="block.button" placeholder="Texto del botón" :maxlength="20" fluid class="!text-sm" />
                </template>

                <!-- multimedia -->
                <template v-if="['image', 'video', 'audio', 'document'].includes(block.type)">
                  <InputText v-model="block.url" placeholder="URL pública (Meta la descarga)" fluid class="!text-sm" />
                  <img
                    v-if="block.type === 'image' && (block.url ?? '').startsWith('http')"
                    :src="block.url"
                    class="max-h-24 w-full rounded-lg object-cover"
                    @error="($event.target as HTMLImageElement).style.display = 'none'"
                  />
                  <InputText v-if="block.type !== 'audio'" v-model="block.caption" placeholder="Descripción (opcional)" fluid class="!text-sm" />
                  <InputText v-if="block.type === 'document'" v-model="block.filename" placeholder="nombre.pdf" fluid class="!text-sm" />
                </template>

                <!-- retraso corto -->
                <div v-if="block.type === 'wait'" class="flex items-center gap-2">
                  <InputNumber v-model="block.seconds" :min="1" :max="15" class="w-24" fluid />
                  <span class="text-xs text-slate-500">segundos entre los textos</span>
                </div>

                <!-- captura -->
                <template v-if="block.type === 'capture'">
                  <InputText v-model="block.field" placeholder="Campo destino (ej: correo)" fluid class="!text-sm font-mono" />
                  <p class="text-[10px] text-slate-400">La siguiente respuesta libre queda guardada en ese campo del contacto.</p>
                </template>

                <!-- lista -->
                <template v-if="block.type === 'list'">
                  <InputText v-model="block.button" placeholder="Botón que abre la lista" :maxlength="20" fluid class="!text-sm" />
                  <div
                    v-for="(row, rowIndex) in block.rows ?? []"
                    :key="row.id"
                    class="flex flex-col gap-1 rounded-lg border border-slate-100 p-1.5"
                  >
                    <div class="flex items-center gap-1">
                      <InputText v-model="row.title" :placeholder="`Opción ${rowIndex + 1} (máx. 24)`" :maxlength="24" fluid class="!text-sm" />
                      <Button
                        icon="pi pi-times"
                        text
                        size="small"
                        severity="secondary"
                        :disabled="(block.rows?.length ?? 0) <= 1"
                        @click="removeBlockOption(block, 'rows', rowIndex)"
                      />
                    </div>
                    <InputText v-model="row.description" placeholder="Descripción (opcional)" :maxlength="72" fluid class="!text-xs" />
                  </div>
                  <button
                    v-if="(block.rows?.length ?? 0) < 10"
                    type="button"
                    class="rounded-lg border border-dashed border-slate-300 py-1.5 text-center text-xs text-slate-500 hover:border-teal-400 hover:text-teal-600"
                    @click="addBlockOption(block, 'rows')"
                  >
                    + Añadir opción
                  </button>
                </template>
              </div>

              <!-- añadir bloques (el catalogo de ManyChat) -->
              <div class="flex flex-col gap-1.5">
                <p class="text-[11px] text-slate-500">Añade uno de los bloques de contenido:</p>
                <button
                  v-for="item in BLOCK_CATALOG.filter((b) => (showMoreBlocks ? !b.primary : b.primary))"
                  :key="item.type"
                  type="button"
                  class="flex items-start gap-2.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-left transition-colors hover:border-teal-400 hover:bg-teal-50/40 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="
                    (selectedNode.data!.def.blocks?.length ?? 0) >= 10 ||
                    (['list', 'capture'].includes(item.type) && hasTerminalBlock) ||
                    (item.type === 'capture' && hasButtonBlocks)
                  "
                  @click="addBlock(item.type)"
                >
                  <i :class="item.icon" class="mt-0.5 text-sm text-slate-400" />
                  <span class="min-w-0">
                    <span class="block text-[13px] font-medium text-slate-700">{{ item.label }}</span>
                    <span class="block text-[11px] leading-tight text-slate-400">{{ item.description }}</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="flex items-center gap-2.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:border-teal-400 hover:bg-teal-50/40"
                  @click="showMoreBlocks = !showMoreBlocks"
                >
                  <i :class="showMoreBlocks ? 'pi pi-arrow-left' : 'pi pi-ellipsis-h'" class="text-sm text-slate-400" />
                  {{ showMoreBlocks ? 'Volver' : 'Más' }}
                  <span v-if="!showMoreBlocks" class="block text-[11px] font-normal text-slate-400">Ver todas las opciones disponibles</span>
                </button>
              </div>

              <p class="rounded-xl border border-dashed border-teal-300 py-2 text-center text-xs font-medium text-teal-600">
                Elegir Siguiente Paso: conecta el punto «Siguiente paso» del nodo
              </p>
            </template>

            <!-- texto (nodos que envían) -->
            <div
              v-if="['message', 'buttons', 'cta_url', 'list', 'capture'].includes(selectedNode.data!.def.type)"
              class="flex flex-col gap-1.5"
            >
              <label class="text-xs font-medium text-slate-600">
                {{ selectedNode.data!.def.type === 'capture' ? 'Pregunta' : 'Mensaje' }}
                <span class="font-normal text-slate-400">(admite <code v-pre>{{variables}}</code>)</span>
              </label>
              <Textarea
                v-model="selectedNode.data!.def.text"
                rows="4"
                auto-resize
                fluid
                class="!text-sm"
              />
              <div class="flex flex-wrap items-center gap-1">
                <span class="text-[10px] uppercase tracking-wide text-slate-400">Insertar:</span>
                <button
                  v-for="variable in availableVariables"
                  :key="variable"
                  type="button"
                  class="rounded bg-teal-600/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 transition-colors hover:bg-teal-600/20"
                  :title="`{{${variable}}}`"
                  @click="insertVariable(variable)"
                >
                  {{ variable.split('.').pop() }}
                </button>
              </div>
            </div>

            <!-- media -->
            <template v-if="selectedNode.data!.def.type === 'media'">
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">Tipo</label>
                <Select
                  v-model="selectedNode.data!.def.kind"
                  :options="[
                    { label: 'Imagen', value: 'image' },
                    { label: 'Video', value: 'video' },
                    { label: 'Audio', value: 'audio' },
                    { label: 'Archivo (PDF, etc.)', value: 'document' },
                  ]"
                  option-label="label"
                  option-value="value"
                  fluid
                  class="!text-sm"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">
                  URL pública <span class="font-normal text-slate-400">(Meta la descarga)</span>
                </label>
                <InputText v-model="selectedNode.data!.def.url" placeholder="https://…" fluid class="!text-sm" />
              </div>
              <div v-if="selectedNode.data!.def.kind !== 'audio'" class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">Descripción (caption)</label>
                <Textarea v-model="selectedNode.data!.def.caption" rows="2" auto-resize fluid class="!text-sm" />
              </div>
              <div v-if="selectedNode.data!.def.kind === 'document'" class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">Nombre del archivo</label>
                <InputText v-model="selectedNode.data!.def.filename" placeholder="catalogo.pdf" fluid class="!text-sm" />
              </div>
            </template>

            <!-- list -->
            <template v-if="selectedNode.data!.def.type === 'list'">
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">Texto del botón que abre la lista</label>
                <InputText
                  v-model="selectedNode.data!.def.button"
                  placeholder="Ver opciones"
                  :maxlength="20"
                  fluid
                  class="!text-sm"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label class="text-xs font-medium text-slate-600">Opciones (máx. 10, regla de Meta)</label>
                <div
                  v-for="(row, index) in selectedNode.data!.def.rows"
                  :key="row.id"
                  class="flex flex-col gap-1 rounded-lg border border-slate-200 p-2"
                >
                  <div class="flex items-center gap-1">
                    <InputText v-model="row.title" :placeholder="`Opción ${index + 1} (máx. 24)`" :maxlength="24" fluid class="!text-sm" />
                    <Button
                      icon="pi pi-times"
                      text
                      size="small"
                      severity="secondary"
                      :disabled="selectedNode.data!.def.rows!.length <= 1"
                      @click="removeRow(index)"
                    />
                  </div>
                  <InputText v-model="row.description" placeholder="Descripción (opcional, máx. 72)" :maxlength="72" fluid class="!text-xs" />
                </div>
                <Button
                  v-if="(selectedNode.data!.def.rows?.length ?? 0) < 10"
                  label="Agregar opción"
                  icon="pi pi-plus"
                  text
                  size="small"
                  @click="addRow"
                />
              </div>
            </template>

            <!-- capture -->
            <div v-if="selectedNode.data!.def.type === 'capture'" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">
                Guardar la respuesta en el campo
                <span class="font-normal text-slate-400">(custom field del contacto)</span>
              </label>
              <InputText v-model="selectedNode.data!.def.field" placeholder="nombre_cita" fluid class="!text-sm" />
              <p class="text-[11px] leading-snug text-slate-400">
                El siguiente texto libre que escriba el contacto queda guardado ahí y el flujo
                continúa. Luego puedes usarlo como <code v-pre>{{contact.fields.tu_campo}}</code>.
              </p>
            </div>

            <!-- template -->
            <template v-if="selectedNode.data!.def.type === 'template'">
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">Plantilla aprobada</label>
                <Select
                  v-model="templateChoice"
                  :options="templateOptions"
                  option-label="label"
                  option-value="value"
                  placeholder="Elige del espejo de Meta"
                  filter
                  fluid
                  class="!text-sm"
                />
                <p v-if="!templateOptions.length" class="text-[11px] text-amber-600">
                  No hay plantillas en el espejo para esta app — créalas o sincroniza en la
                  pantalla Plantillas.
                </p>
              </div>
              <div
                v-if="(selectedNode.data!.def.params?.length ?? 0) > 0"
                class="flex flex-col gap-1.5"
              >
                <label class="text-xs font-medium text-slate-600">
                  Variables del cuerpo
                  <span class="font-normal text-slate-400">(admiten <code v-pre>{{contexto}}</code>)</span>
                </label>
                <InputText
                  v-for="(_, index) in selectedNode.data!.def.params"
                  :key="index"
                  v-model="selectedNode.data!.def.params![index]"
                  :placeholder="`{{${index + 1}}}`"
                  fluid
                  class="!text-sm"
                />
              </div>
              <div v-if="selectedTemplate" class="rounded-xl bg-[#e5ddd5] p-3">
                <p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Vista previa
                </p>
                <TemplatePreview
                  :components="selectedTemplate.components"
                  :params="selectedNode.data!.def.params"
                />
              </div>
              <p class="text-[11px] leading-snug text-slate-400">
                La plantilla es lo único que WhatsApp entrega fuera de la ventana de 24 horas — el
                seguimiento correcto después de una Espera larga.
              </p>
            </template>

            <!-- product -->
            <template v-if="selectedNode.data!.def.type === 'product'">
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">¿Qué se muestra?</label>
                <SelectButton
                  v-model="productMode"
                  :options="[
                    { label: 'Un producto', value: 'single' },
                    { label: 'Varios (menú)', value: 'multi' },
                  ]"
                  option-label="label"
                  option-value="value"
                  :allow-empty="false"
                />
              </div>

              <div v-if="productMode === 'single'" class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-slate-600">Producto del catálogo</label>
                <Select
                  v-model="selectedNode.data!.def.retailer_id"
                  :options="catalogItemOptions"
                  option-label="label"
                  option-value="value"
                  placeholder="Elige o escribe el retailer_id"
                  editable
                  filter
                  fluid
                  class="!text-sm"
                />
              </div>

              <template v-else>
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-medium text-slate-600">Encabezado del menú</label>
                  <InputText v-model="selectedNode.data!.def.header" placeholder="Catálogo" fluid class="!text-sm" />
                </div>
                <div class="flex flex-col gap-2">
                  <label class="text-xs font-medium text-slate-600">Secciones (máx. 10 / 30 productos)</label>
                  <div
                    v-for="(section, index) in selectedNode.data!.def.sections"
                    :key="index"
                    class="flex flex-col gap-1 rounded-lg border border-slate-200 p-2"
                  >
                    <div class="flex items-center gap-1">
                      <InputText v-model="section.title" :placeholder="`Sección ${index + 1}`" fluid class="!text-sm" />
                      <Button
                        icon="pi pi-times"
                        text
                        size="small"
                        severity="secondary"
                        :disabled="selectedNode.data!.def.sections!.length <= 1"
                        @click="removeSection(index)"
                      />
                    </div>
                    <MultiSelect
                      v-model="section.retailer_ids"
                      :options="catalogItemOptions"
                      option-label="label"
                      option-value="value"
                      placeholder="Productos de esta sección"
                      filter
                      display="chip"
                      fluid
                      class="!text-xs"
                    />
                  </div>
                  <Button
                    v-if="(selectedNode.data!.def.sections?.length ?? 0) < 10"
                    label="Agregar sección"
                    icon="pi pi-plus"
                    text
                    size="small"
                    @click="addSection"
                  />
                </div>
              </template>
              <p v-if="!catalogItemOptions.length" class="text-[11px] text-amber-600">
                No hay productos sincronizados para esta app — revisa la pantalla Catálogo.
              </p>
              <p class="text-[11px] leading-snug text-slate-400">
                La clienta puede armar el pedido en el chat; te llega por el circuito de pedidos
                de WhatsApp de siempre.
              </p>
            </template>

            <!-- random -->
            <div v-if="selectedNode.data!.def.type === 'random'" class="flex flex-col gap-2">
              <label class="text-xs font-medium text-slate-600">Ramas y pesos (2-5)</label>
              <div
                v-for="(branch, index) in selectedNode.data!.def.branches"
                :key="index"
                class="flex items-center gap-2"
              >
                <span class="w-5 text-center text-xs font-bold text-slate-500">{{ 'ABCDE'[index] }}</span>
                <InputNumber v-model="branch.weight" :min="1" :max="100" class="flex-1" fluid />
                <Button
                  icon="pi pi-times"
                  text
                  size="small"
                  severity="secondary"
                  :disabled="selectedNode.data!.def.branches!.length <= 2"
                  @click="removeBranch(index)"
                />
              </div>
              <Button
                v-if="(selectedNode.data!.def.branches?.length ?? 0) < 5"
                label="Agregar rama"
                icon="pi pi-plus"
                text
                size="small"
                @click="addBranch"
              />
              <p class="text-[11px] leading-snug text-slate-400">
                Los pesos son proporciones (no tienen que sumar 100). El dado se tira en cada
                corrida.
              </p>
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

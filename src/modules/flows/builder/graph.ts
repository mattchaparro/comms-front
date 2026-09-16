// Traducción entre la definición JSON del motor (core/flows/engine.py en
// nexolu-comms-api) y el grafo del builder visual (@vue-flow/core).
//
// La verdad mientras se edita son los nodos/aristas de Vue Flow: cada nodo
// lleva en `data` su FlowNodeDef SIN los punteros de salto (next /
// buttons[].next / then / else) — esos viven como aristas, identificadas
// por el `sourceHandle`:
//   'next'      -> message / cta_url / delay
//   'btn:<id>'  -> cada botón de un nodo buttons
//   'then' / 'else' -> las ramas de un condition
// Al guardar, `graphToDefinition` los vuelve a fundir en el JSON que valida
// el backend, con las posiciones en `ui.positions` (el motor las ignora).

import type { Edge, Node } from '@vue-flow/core'

import type { FlowDefinition, FlowNodeDef, FlowNodeType } from '@/types/flows'

export interface BuilderNodeData {
  def: FlowNodeDef
  isStart: boolean
}

export type BuilderNode = Node<BuilderNodeData>

// El nodo "Cuando..." (el disparador, como en ManyChat): virtual - existe
// solo en el canvas, NO en definition.nodes. Su arista de salida define el
// `start` del flujo (reconectarla cambia el inicio); su posicion se guarda
// en ui.positions bajo esta misma clave.
export const TRIGGER_NODE_ID = '__trigger__'

export interface TriggerNodeData {
  triggerType: 'api' | 'keyword'
  keywords: string[]
}

// Identidad del builder (propia de Connect, lenguaje visual de las
// herramientas de automatizacion): tarjeta blanca + franja de encabezado
// PASTEL con texto oscuro por categoria; `accent` es el color fuerte de
// los puntos de conexion y el borde de seleccion.
export const NODE_CATALOG: Record<
  FlowNodeType,
  { label: string; icon: string; accent: string; headerBg: string; description: string }
> = {
  message: {
    // Verde WhatsApp: el nodo que envia un mensaje se ve como el canal.
    label: 'Mensaje',
    icon: 'pi pi-comment',
    accent: '#16a34a',
    headerBg: '#dcfce7',
    description: 'Envía un texto y sigue de largo.',
  },
  buttons: {
    label: 'Botones',
    icon: 'pi pi-list',
    accent: '#7c3aed',
    headerBg: '#ede9fe',
    description: 'Hasta 3 botones (regla de Meta). Espera la respuesta.',
  },
  cta_url: {
    label: 'Abrir link',
    icon: 'pi pi-external-link',
    accent: '#0891b2',
    headerBg: '#cffafe',
    description: 'Botón que abre una URL (la acción vive en tu web/app).',
  },
  condition: {
    label: 'Condición',
    icon: 'pi pi-filter',
    accent: '#0d9488',
    headerBg: '#ccfbf1',
    description: 'Ramifica por tag o campo del contacto. No envía nada.',
  },
  delay: {
    label: 'Espera',
    icon: 'pi pi-clock',
    accent: '#d97706',
    headerBg: '#fef3c7',
    description: 'Pausa el flujo y sigue solo cuando pasa el tiempo.',
  },
  random: {
    label: 'Aleatorizador',
    icon: 'pi pi-percentage',
    accent: '#db2777',
    headerBg: '#fce7f3',
    description: 'Reparte el tráfico entre 2-5 ramas (test A/B).',
  },
  media: {
    label: 'Multimedia',
    icon: 'pi pi-image',
    accent: '#ea580c',
    headerBg: '#ffedd5',
    description: 'Imagen, video, audio o archivo (por link público).',
  },
  list: {
    label: 'Lista de opciones',
    icon: 'pi pi-bars',
    accent: '#65a30d',
    headerBg: '#ecfccb',
    description: 'Menú de hasta 10 opciones. Espera la elección.',
  },
  capture: {
    label: 'Recopilar dato',
    icon: 'pi pi-inbox',
    accent: '#334155',
    headerBg: '#e2e8f0',
    description: 'Pregunta y guarda la respuesta en un campo del contacto.',
  },
}

// --- definición -> grafo ------------------------------------------------------

export function definitionToGraph(definition: FlowDefinition): {
  nodes: BuilderNode[]
  edges: Edge[]
} {
  const positions = definition.ui?.positions ?? {}
  const laidOut = autoLayout(definition)

  const nodes: BuilderNode[] = Object.entries(definition.nodes).map(([id, raw]) => {
    const def: FlowNodeDef = { ...raw }
    delete def.next
    delete def.then
    delete def.else
    if (def.buttons) def.buttons = def.buttons.map(({ id: bid, title }) => ({ id: bid, title }))
    if (def.branches) def.branches = def.branches.map(({ weight }) => ({ weight }))
    if (def.rows)
      def.rows = def.rows.map(({ id: rid, title, description }) => ({
        id: rid,
        title,
        ...(description ? { description } : {}),
      }))
    return {
      id,
      type: 'flow',
      position: positions[id] ?? laidOut[id] ?? { x: 0, y: 0 },
      data: { def, isStart: id === definition.start },
    }
  })

  const edges: Edge[] = []
  for (const [id, node] of Object.entries(definition.nodes)) {
    if (node.next && definition.nodes[node.next]) {
      edges.push(makeEdge(id, 'next', node.next))
    }
    for (const button of node.buttons ?? []) {
      if (button.next && definition.nodes[button.next]) {
        edges.push(makeEdge(id, `btn:${button.id}`, button.next))
      }
    }
    for (const [index, branch] of (node.branches ?? []).entries()) {
      if (branch.next && definition.nodes[branch.next]) {
        edges.push(makeEdge(id, `br:${index}`, branch.next))
      }
    }
    for (const row of node.rows ?? []) {
      if (row.next && definition.nodes[row.next]) {
        edges.push(makeEdge(id, `row:${row.id}`, row.next))
      }
    }
    for (const branch of ['then', 'else'] as const) {
      const target = node[branch]
      if (target && definition.nodes[target]) {
        edges.push(makeEdge(id, branch, target))
      }
    }
  }

  return { nodes, edges }
}

export function makeEdge(source: string, sourceHandle: string, target: string): Edge {
  // Semaforo de ramas (lenguaje comun de estos builders): la rama "si"
  // en verde, la "no" en rojo, el disparador en teal, el resto gris.
  const stroke =
    source === TRIGGER_NODE_ID
      ? '#0d9488'
      : sourceHandle === 'then'
        ? '#22c55e'
        : sourceHandle === 'else'
          ? '#f87171'
          : '#94a3b8'
  return {
    id: `${source}:${sourceHandle}->${target}`,
    source,
    sourceHandle,
    target,
    animated: sourceHandle === 'then' || sourceHandle === 'else',
    style: { stroke, strokeWidth: 2 },
  }
}

// --- grafo -> definición ------------------------------------------------------

export function graphToDefinition(nodes: Node[], edges: Edge[]): FlowDefinition {
  const outgoing = new Map<string, string>()
  for (const edge of edges) {
    if (edge.sourceHandle) outgoing.set(`${edge.source}|${edge.sourceHandle}`, edge.target)
  }

  // El inicio lo define la arista del nodo disparador (como en ManyChat:
  // reconectar "Entonces" cambia por donde arranca el flujo); si no hay,
  // cae al isStart marcado o al primer nodo.
  const flowNodes = nodes.filter((n): n is BuilderNode => n.id !== TRIGGER_NODE_ID)
  const start =
    outgoing.get(`${TRIGGER_NODE_ID}|start`) ??
    flowNodes.find((n) => n.data?.isStart)?.id ??
    flowNodes[0]?.id ??
    ''

  const result: FlowDefinition = { start, nodes: {}, ui: { positions: {} } }
  const trigger = nodes.find((n) => n.id === TRIGGER_NODE_ID)
  if (trigger) {
    result.ui!.positions![TRIGGER_NODE_ID] = {
      x: Math.round(trigger.position.x),
      y: Math.round(trigger.position.y),
    }
  }
  for (const node of flowNodes) {
    const def: FlowNodeDef = { ...(node.data?.def ?? { type: 'message' }) }

    if (def.type === 'condition') {
      const thenTarget = outgoing.get(`${node.id}|then`)
      const elseTarget = outgoing.get(`${node.id}|else`)
      if (thenTarget) def.then = thenTarget
      else delete def.then
      if (elseTarget) def.else = elseTarget
      else delete def.else
      delete def.next
    } else if (def.type === 'buttons') {
      def.buttons = (def.buttons ?? []).map((button) => {
        const next = outgoing.get(`${node.id}|btn:${button.id}`)
        return next ? { ...button, next } : { id: button.id, title: button.title }
      })
      delete def.next
    } else if (def.type === 'random') {
      def.branches = (def.branches ?? []).map((branch, index) => {
        const next = outgoing.get(`${node.id}|br:${index}`)
        return next ? { weight: branch.weight, next } : { weight: branch.weight }
      })
      delete def.next
    } else if (def.type === 'list') {
      def.rows = (def.rows ?? []).map((row) => {
        const next = outgoing.get(`${node.id}|row:${row.id}`)
        const base = {
          id: row.id,
          title: row.title,
          ...(row.description ? { description: row.description } : {}),
        }
        return next ? { ...base, next } : base
      })
      delete def.next
    } else {
      const next = outgoing.get(`${node.id}|next`)
      if (next) def.next = next
      else delete def.next
    }

    // Efectos vacíos fuera: el JSON guardado queda igual de limpio que uno
    // escrito a mano en el modo avanzado.
    if (!def.add_tags?.length) delete def.add_tags
    if (!def.remove_tags?.length) delete def.remove_tags
    if (!def.set_fields || Object.keys(def.set_fields).length === 0) delete def.set_fields

    result.nodes[node.id] = def
    result.ui!.positions![node.id] = {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    }
  }
  return result
}

// --- utilidades ---------------------------------------------------------------

/** Los handles de salida que expone un nodo, en orden de dibujo. */
export function sourceHandles(def: FlowNodeDef): { id: string; label: string }[] {
  if (def.type === 'condition') {
    return [
      { id: 'then', label: 'Sí' },
      { id: 'else', label: 'No' },
    ]
  }
  if (def.type === 'buttons') {
    return (def.buttons ?? []).map((b) => ({ id: `btn:${b.id}`, label: b.title || '(botón)' }))
  }
  if (def.type === 'random') {
    const branches = def.branches ?? []
    const total = branches.reduce((sum, b) => sum + Math.max(1, b.weight), 0) || 1
    const letters = 'ABCDE'
    return branches.map((b, index) => ({
      id: `br:${index}`,
      label: `${letters[index] ?? index + 1} · ${Math.round((Math.max(1, b.weight) / total) * 100)}%`,
    }))
  }
  if (def.type === 'list') {
    return (def.rows ?? []).map((r) => ({ id: `row:${r.id}`, label: r.title || '(opción)' }))
  }
  return [{ id: 'next', label: 'Sigue' }]
}

export function newNodeId(existing: Set<string>): string {
  let index = existing.size + 1
  while (existing.has(`nodo_${index}`)) index += 1
  return `nodo_${index}`
}

export function newButtonId(options: { id: string }[]): string {
  let index = options.length + 1
  while (options.some((b) => b.id === `opcion_${index}`)) index += 1
  return `opcion_${index}`
}

export function defaultNodeDef(type: FlowNodeType): FlowNodeDef {
  switch (type) {
    case 'message':
      return { type, text: '' }
    case 'buttons':
      return { type, text: '', buttons: [{ id: 'opcion_1', title: '' }] }
    case 'cta_url':
      return { type, text: '', url: 'https://', button: 'Abrir' }
    case 'condition':
      return { type, when: { tag: '' } }
    case 'delay':
      return { type, minutes: 60 }
    case 'random':
      return { type, branches: [{ weight: 50 }, { weight: 50 }] }
    case 'media':
      return { type, kind: 'image', url: 'https://', caption: '' }
    case 'list':
      return {
        type,
        text: '',
        button: 'Ver opciones',
        rows: [{ id: 'opcion_1', title: '' }],
      }
    case 'capture':
      return { type, text: '', field: '' }
  }
}

/** Columnas por profundidad desde `start` (BFS): el fallback para flujos
 * guardados desde el modo avanzado, que no traen posiciones. */
export function autoLayout(definition: FlowDefinition): Record<string, { x: number; y: number }> {
  const COL_WIDTH = 340
  const ROW_HEIGHT = 170
  const depths = new Map<string, number>()
  const queue: string[] = definition.start && definition.nodes[definition.start] ? [definition.start] : []
  depths.set(definition.start, 0)

  while (queue.length > 0) {
    const id = queue.shift()!
    const node = definition.nodes[id]
    if (!node) continue
    const depth = depths.get(id) ?? 0
    const targets = [
      node.next,
      node.then,
      node.else,
      ...(node.buttons ?? []).map((b) => b.next),
      ...(node.branches ?? []).map((b) => b.next),
      ...(node.rows ?? []).map((r) => r.next),
    ].filter((t): t is string => Boolean(t && definition.nodes[t]))
    for (const target of targets) {
      if (!depths.has(target)) {
        depths.set(target, depth + 1)
        queue.push(target)
      }
    }
  }

  let orphanRow = 0
  const rows = new Map<number, number>()
  const positions: Record<string, { x: number; y: number }> = {}
  for (const id of Object.keys(definition.nodes)) {
    const depth = depths.get(id)
    if (depth === undefined) {
      // Nodo no alcanzable desde start: columna propia al final.
      positions[id] = { x: 0, y: 400 + orphanRow * ROW_HEIGHT }
      orphanRow += 1
      continue
    }
    const row = rows.get(depth) ?? 0
    rows.set(depth, row + 1)
    positions[id] = { x: depth * COL_WIDTH, y: row * ROW_HEIGHT }
  }
  return positions
}

// Refleja FlowOut/FlowIn/FlowPatch y ContactOut/ContactPatch
// (api/v1/admin_flows.py en nexolu-comms-api) - mantener sincronizado.
// El esquema de nodos refleja core/flows/engine.py (motor v2).

export type FlowNodeType =
  | 'message'
  | 'buttons'
  | 'cta_url'
  | 'condition'
  | 'delay'
  | 'random'
  | 'media'
  | 'list'
  | 'capture'
  | 'template'
  | 'product'
  | 'blocks'
  | 'actions'

// Un bloque del paso "Enviar mensaje" (nodo `blocks`): cada uno es SU
// PROPIO mensaje de WhatsApp, enviados seguidos. `wait` = pausa corta
// entre textos; `capture`/`list` solo al final (esperan respuesta).
export type BlockType =
  | 'text'
  | 'cta'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'wait'
  | 'capture'
  | 'list'

export interface MessageBlock {
  type: BlockType
  text?: string
  buttons?: FlowButton[]
  url?: string
  button?: string
  caption?: string
  filename?: string
  seconds?: number
  field?: string
  rows?: ListRow[]
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document'

// Fila del mensaje de lista (interactive.list, hasta 10).
export interface ListRow {
  id: string
  title: string
  description?: string
  next?: string | null
}

// Rama del aleatorizador: dado ponderado, re-tirado en cada corrida.
export interface RandomBranch {
  weight: number
  next?: string | null
}

export interface FlowButton {
  id: string
  title: string
  next?: string | null
}

// Exactamente UNA forma: tag/not_tag, o field + un operador.
export interface ConditionWhen {
  tag?: string
  not_tag?: string
  field?: string
  equals?: string
  not_equals?: string
  contains?: string
  exists?: boolean
}

// Una accion del nodo Acciones ("Realiza las siguientes acciones..." de
// ManyChat con el guardrail de Connect). `fields` es dict en set_fields y
// lista en clear_fields (mismo nombre que usa el motor).
export type FlowActionType =
  | 'add_tags'
  | 'remove_tags'
  | 'set_fields'
  | 'clear_fields'
  | 'http_request'
  | 'notify_app'
  | 'start_flow'

export interface FlowAction {
  type: FlowActionType
  tags?: string[]
  fields?: Record<string, string> | string[]
  method?: 'GET' | 'POST'
  url?: string
  headers?: Record<string, string>
  body?: unknown
  save?: Record<string, string>
  message?: string
  flow?: string
}

export interface FlowNodeDef {
  type: FlowNodeType
  // titulo del paso en el canvas ("Enviar mensaje #1"); el motor lo ignora
  title?: string
  // blocks (el paso "Enviar mensaje": pila de bloques de contenido)
  blocks?: MessageBlock[]
  // actions (1-10 acciones en orden; start_flow solo de ultima)
  actions?: FlowAction[]
  text?: string
  next?: string | null
  // buttons
  buttons?: FlowButton[]
  // cta_url
  url?: string
  button?: string
  // condition: multi-rama (`cases` en orden, primer match gana, si no `else`)
  // o la forma clasica when+then/else (legacy, el motor soporta ambas).
  cases?: { when: ConditionWhen; next?: string | null }[]
  when?: ConditionWhen
  then?: string | null
  else?: string | null
  // delay
  minutes?: number
  // random (2 a 5 ramas)
  branches?: RandomBranch[]
  // media (por link publico; caption en image/video/document)
  kind?: MediaKind
  caption?: string
  filename?: string
  // list (reusa `button` como texto del boton que abre la lista)
  rows?: ListRow[]
  // capture (guarda el siguiente texto libre en contact.fields[field])
  field?: string
  // template (plantilla aprobada de Meta: lo UNICO que entrega fuera de la
  // ventana de 24h; params llena {{1}}, {{2}}... del cuerpo)
  template?: string
  language?: string
  params?: string[]
  // product (catalogo): retailer_id = UN producto (SPM); sections = varios
  // (MPM, max 10 secciones / 30 productos). El catalog_id lo pone el canal.
  retailer_id?: string
  header?: string
  sections?: { title: string; retailer_ids: string[] }[]
  // efectos sobre el contacto (cualquier nodo)
  add_tags?: string[]
  remove_tags?: string[]
  set_fields?: Record<string, string>
}

export interface FlowDefinition {
  start: string
  nodes: Record<string, FlowNodeDef>
  // Del builder visual; el motor la ignora por completo.
  ui?: { positions?: Record<string, { x: number; y: number }> }
}

export interface Flow {
  id: string
  app_id: string
  business_id: string
  name: string
  trigger_type: 'keyword' | 'api'
  trigger_keywords: string[]
  is_active: boolean
  definition: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface FlowCreatePayload {
  app_id: string
  business_id?: string
  name: string
  trigger_type: 'keyword' | 'api'
  trigger_keywords?: string[]
  is_active?: boolean
  definition: Record<string, unknown>
}

export interface FlowPatchPayload {
  trigger_type?: 'keyword' | 'api'
  trigger_keywords?: string[]
  is_active?: boolean
  definition?: Record<string, unknown>
}

export interface Contact {
  id: string
  app_id: string
  business_id: string
  phone: string
  name: string
  tags: string[]
  fields: Record<string, unknown>
  last_inbound_at: string | null
  created_at: string
}

// La plantilla con la que arranca el editor: el caso real del spa. Sirve
// de documentacion viva del esquema de nodos (ver core/flows/engine.py).
export const EXAMPLE_DEFINITION = {
  start: 'menu',
  nodes: {
    menu: {
      type: 'buttons',
      text: 'Hola {{contact.name}}, tu cita de {{servicio}} quedó para {{fecha}}.',
      buttons: [
        { id: 'cancelacion', title: 'Cancelaciones', next: 'cancelacion' },
        { id: 'garantias', title: 'Garantías', next: 'garantias' },
        { id: 'gestionar', title: 'Gestionar cita', next: 'gestionar' },
      ],
    },
    cancelacion: {
      type: 'message',
      text: 'Puedes cancelar sin costo hasta 24h antes de tu cita.',
      add_tags: ['pregunto_cancelacion'],
    },
    garantias: { type: 'message', text: 'Tienes garantía de 8 días en semipermanente.' },
    gestionar: {
      type: 'cta_url',
      text: 'Gestiona tu cita aquí:',
      url: 'https://agenda.nexolu.co/{{slug}}',
      button: 'Abrir agenda',
    },
  },
}

// Refleja FlowOut/FlowIn/FlowPatch y ContactOut/ContactPatch
// (api/v1/admin_flows.py en nexolu-comms-api) - mantener sincronizado.
// El esquema de nodos refleja core/flows/engine.py (motor v2).

export type FlowNodeType = 'message' | 'buttons' | 'cta_url' | 'condition' | 'delay'

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

export interface FlowNodeDef {
  type: FlowNodeType
  text?: string
  next?: string | null
  // buttons
  buttons?: FlowButton[]
  // cta_url
  url?: string
  button?: string
  // condition
  when?: ConditionWhen
  then?: string | null
  else?: string | null
  // delay
  minutes?: number
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

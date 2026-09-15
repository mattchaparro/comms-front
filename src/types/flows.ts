// Refleja FlowOut/FlowIn/FlowPatch y ContactOut/ContactPatch
// (api/v1/admin_flows.py en nexolu-comms-api) - mantener sincronizado.

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

// El simulador del builder: camina la definición ACTUAL del canvas con la
// misma semántica de core/flows/engine.py (interpolación, efectos,
// condición, dado, esperas) pero sin enviar nada — para probar un flujo
// completo sin gastar mensajes ni número. La Espera se salta con aviso
// (nadie quiere esperar 2 días en una vista previa).

import type { FlowDefinition, FlowNodeDef } from '@/types/flows'

export interface SimContact {
  name: string
  phone: string
  tags: string[]
  fields: Record<string, string>
}

export type SimEvent =
  | { kind: 'bubble'; text: string }
  | { kind: 'media'; mediaKind: string; url: string; caption?: string }
  | { kind: 'template'; name: string; language: string; params: string[] }
  | { kind: 'cta'; text: string; url: string; button: string }
  | { kind: 'choices'; options: { id: string; title: string; description?: string }[]; listButton?: string }
  | { kind: 'user'; text: string }
  | { kind: 'info'; icon: string; text: string }

const MAX_STEPS = 30

export class FlowSimulator {
  readonly events: SimEvent[] = []
  readonly contact: SimContact
  waiting: 'choice' | 'text' | null = null

  private current: string | null = null
  private readonly definition: FlowDefinition
  private readonly variables: Record<string, string>

  constructor(
    definition: FlowDefinition,
    contact: SimContact,
    variables: Record<string, string>,
  ) {
    this.definition = definition
    this.contact = contact
    this.variables = variables
  }

  start(): void {
    this.run(this.definition.start)
  }

  /** La clienta toca un botón o una opción de la lista. */
  choose(optionId: string): void {
    const node = this.node(this.current)
    if (!node || this.waiting !== 'choice') return
    const options = [
      ...(node.buttons ?? []),
      ...(node.rows ?? []),
      ...(node.blocks ?? []).flatMap((b) => [...(b.buttons ?? []), ...(b.rows ?? [])]),
    ]
    const chosen = options.find((o) => o.id === optionId)
    if (!chosen) return
    this.events.push({ kind: 'user', text: chosen.title })
    this.waiting = null
    this.run(chosen.next ?? null)
  }

  /** La clienta escribe texto libre (solo avanza en una captura). */
  input(text: string): void {
    const node = this.node(this.current)
    if (!node || this.waiting !== 'text' || !text.trim()) return
    const lastBlock = node.blocks?.[node.blocks.length - 1]
    const field = node.type === 'blocks' ? lastBlock?.field : node.field
    this.events.push({ kind: 'user', text })
    this.contact.fields = { ...this.contact.fields, [String(field)]: text.trim() }
    this.events.push({
      kind: 'info',
      icon: 'pi pi-inbox',
      text: `Guardado en el campo «${field}»`,
    })
    this.waiting = null
    this.run(node.next ?? null)
  }

  private node(id: string | null | undefined): FlowNodeDef | null {
    return id ? (this.definition.nodes[id] ?? null) : null
  }

  private context(): Record<string, unknown> {
    return {
      ...this.variables,
      contact: {
        name: this.contact.name,
        phone: this.contact.phone,
        tags: this.contact.tags,
        fields: this.contact.fields,
      },
    }
  }

  private run(startId: string | null): void {
    let nodeId = startId
    let steps = 0

    while (nodeId && steps < MAX_STEPS) {
      const node = this.node(nodeId)
      if (!node) break
      steps += 1
      this.current = nodeId

      this.applyEffects(node)
      const context = this.context()
      const text = interpolate(String(node.text ?? ''), context)

      switch (node.type) {
        case 'message':
          this.events.push({ kind: 'bubble', text })
          nodeId = node.next ?? null
          break
        case 'buttons':
          this.events.push({ kind: 'bubble', text })
          this.events.push({
            kind: 'choices',
            options: (node.buttons ?? []).map((b) => ({
              id: b.id,
              title: interpolate(b.title, context),
            })),
          })
          this.waiting = 'choice'
          return
        case 'list':
          this.events.push({ kind: 'bubble', text })
          this.events.push({
            kind: 'choices',
            listButton: node.button || 'Ver opciones',
            options: (node.rows ?? []).map((r) => ({
              id: r.id,
              title: interpolate(r.title, context),
              description: r.description ? interpolate(r.description, context) : undefined,
            })),
          })
          this.waiting = 'choice'
          return
        case 'capture':
          this.events.push({ kind: 'bubble', text })
          this.waiting = 'text'
          return
        case 'cta_url':
          this.events.push({
            kind: 'cta',
            text,
            url: interpolate(String(node.url ?? ''), context),
            button: node.button || 'Abrir',
          })
          nodeId = node.next ?? null
          break
        case 'media':
          this.events.push({
            kind: 'media',
            mediaKind: node.kind ?? 'image',
            url: interpolate(String(node.url ?? ''), context),
            caption: node.caption ? interpolate(node.caption, context) : undefined,
          })
          nodeId = node.next ?? null
          break
        case 'template':
          this.events.push({
            kind: 'template',
            name: node.template ?? '',
            language: node.language || 'es',
            params: (node.params ?? []).map((p) => interpolate(p, context)),
          })
          nodeId = node.next ?? null
          break
        case 'actions': {
          // Las acciones se muestran como chips; la solicitud externa NO se
          // llama en el ensayo (el mock no puede pegarle a tu API real).
          let jumped = false
          for (const action of node.actions ?? []) {
            switch (action.type) {
              case 'add_tags':
                this.contact.tags = [...new Set([...this.contact.tags, ...(action.tags ?? [])])]
                this.events.push({
                  kind: 'info',
                  icon: 'pi pi-tag',
                  text: (action.tags ?? []).map((t) => `+${t}`).join('  '),
                })
                break
              case 'remove_tags': {
                const gone = new Set(action.tags ?? [])
                this.contact.tags = this.contact.tags.filter((t) => !gone.has(t))
                this.events.push({
                  kind: 'info',
                  icon: 'pi pi-tag',
                  text: (action.tags ?? []).map((t) => `−${t}`).join('  '),
                })
                break
              }
              case 'set_fields': {
                const fields = (action.fields ?? {}) as Record<string, string>
                const applied = Object.fromEntries(
                  Object.entries(fields).map(([k, v]) => [k, interpolate(String(v), this.context())]),
                )
                this.contact.fields = { ...this.contact.fields, ...applied }
                this.events.push({
                  kind: 'info',
                  icon: 'pi pi-pencil',
                  text: `Campos: ${Object.keys(applied).join(', ')}`,
                })
                break
              }
              case 'clear_fields': {
                const gone = new Set((action.fields ?? []) as string[])
                this.contact.fields = Object.fromEntries(
                  Object.entries(this.contact.fields).filter(([k]) => !gone.has(k)),
                )
                this.events.push({ kind: 'info', icon: 'pi pi-eraser', text: `Borrados: ${[...gone].join(', ')}` })
                break
              }
              case 'http_request': {
                let host = action.url ?? ''
                try {
                  host = new URL(interpolate(action.url ?? '', this.context())).host
                } catch {
                  /* url a medias */
                }
                const saved = Object.keys(action.save ?? {})
                for (const campo of saved) {
                  this.contact.fields = { ...this.contact.fields, [campo]: `⟨respuesta de ${host}⟩` }
                }
                this.events.push({
                  kind: 'info',
                  icon: 'pi pi-arrow-right-arrow-left',
                  text: `Solicitud externa a ${host} — no se llama en el ensayo${saved.length ? `; guardaría: ${saved.join(', ')}` : ''}`,
                })
                break
              }
              case 'notify_app':
                this.events.push({
                  kind: 'info',
                  icon: 'pi pi-bell',
                  text: `Aviso a tu app: «${interpolate(action.message ?? '', this.context()).slice(0, 60)}»`,
                })
                break
              case 'start_flow':
                this.events.push({
                  kind: 'info',
                  icon: 'pi pi-directions',
                  text: `Salta al flujo «${action.flow}» (el ensayo termina aquí)`,
                })
                jumped = true
                break
            }
            if (jumped) break
          }
          if (jumped) {
            this.current = null
            this.waiting = null
            return
          }
          nodeId = node.next ?? null
          break
        }
        case 'blocks': {
          // El paso "Enviar mensaje": cada bloque como su propio mensaje.
          const options: { id: string; title: string; description?: string }[] = []
          let waitsText = false
          for (const block of node.blocks ?? []) {
            const blockText = interpolate(String(block.text ?? ''), this.context())
            switch (block.type) {
              case 'wait':
                this.events.push({
                  kind: 'info',
                  icon: 'pi pi-clock',
                  text: `Pausa de ${block.seconds ?? 1}s`,
                })
                break
              case 'image':
              case 'video':
              case 'audio':
              case 'document':
                this.events.push({
                  kind: 'media',
                  mediaKind: block.type,
                  url: interpolate(String(block.url ?? ''), this.context()),
                  caption: block.caption ? interpolate(block.caption, this.context()) : undefined,
                })
                break
              case 'cta':
                this.events.push({
                  kind: 'cta',
                  text: blockText,
                  url: interpolate(String(block.url ?? ''), this.context()),
                  button: block.button || 'Abrir',
                })
                break
              case 'capture':
                this.events.push({ kind: 'bubble', text: blockText })
                waitsText = true
                break
              case 'list':
                this.events.push({ kind: 'bubble', text: blockText })
                this.events.push({
                  kind: 'choices',
                  listButton: block.button || 'Ver opciones',
                  options: (block.rows ?? []).map((r) => ({
                    id: r.id,
                    title: interpolate(r.title, this.context()),
                    description: r.description ? interpolate(r.description, this.context()) : undefined,
                  })),
                })
                break
              default: {
                this.events.push({ kind: 'bubble', text: blockText })
                for (const button of block.buttons ?? []) {
                  options.push({ id: button.id, title: interpolate(button.title, this.context()) })
                }
              }
            }
          }
          const lastIsList = node.blocks?.[node.blocks.length - 1]?.type === 'list'
          if (waitsText) {
            this.waiting = 'text'
            return
          }
          if (options.length && !lastIsList) {
            this.events.push({ kind: 'choices', options })
          }
          if (options.length || lastIsList) {
            this.waiting = 'choice'
            return
          }
          nodeId = node.next ?? null
          break
        }
        case 'product': {
          if (text) this.events.push({ kind: 'bubble', text })
          const count = node.sections
            ? node.sections.reduce((sum, s) => sum + s.retailer_ids.length, 0)
            : 1
          this.events.push({
            kind: 'info',
            icon: 'pi pi-shopping-bag',
            text: node.sections
              ? `Menú de catálogo: ${count} producto(s)`
              : `Producto: ${node.retailer_id || '(sin elegir)'}`,
          })
          nodeId = node.next ?? null
          break
        }
        case 'condition': {
          const cases = node.cases ?? (node.when ? [{ when: node.when, next: node.then }] : [])
          let matched = -1
          for (let i = 0; i < cases.length; i++) {
            if (evaluateWhen(cases[i].when ?? {}, context)) {
              matched = i
              break
            }
          }
          this.events.push({
            kind: 'info',
            icon: 'pi pi-filter',
            text:
              matched >= 0
                ? `Condición: caso ${matched + 1} (${describeWhenShort(cases[matched].when)})`
                : 'Condición: ningún caso aplicó → Si no…',
          })
          nodeId = (matched >= 0 ? cases[matched].next : node.else) ?? null
          break
        }
        case 'random': {
          const branches = node.branches ?? []
          const total = branches.reduce((sum, b) => sum + Math.max(1, b.weight), 0)
          let roll = Math.random() * total
          let index = 0
          for (let i = 0; i < branches.length; i++) {
            roll -= Math.max(1, branches[i].weight)
            if (roll <= 0) {
              index = i
              break
            }
          }
          this.events.push({
            kind: 'info',
            icon: 'pi pi-percentage',
            text: `Aleatorizador: rama ${'ABCDE'[index] ?? index + 1}`,
          })
          nodeId = branches[index]?.next ?? null
          break
        }
        case 'delay': {
          const minutes = node.minutes ?? 0
          this.events.push({
            kind: 'info',
            icon: 'pi pi-clock',
            text: `Espera de ${formatMinutes(minutes)} — saltada en la vista previa`,
          })
          nodeId = node.next ?? null
          break
        }
      }
    }

    this.current = null
    this.waiting = null
    this.events.push({ kind: 'info', icon: 'pi pi-check-circle', text: 'Fin del flujo' })
  }

  private applyEffects(node: FlowNodeDef): void {
    const add = node.add_tags ?? []
    const remove = new Set(node.remove_tags ?? [])
    if (add.length || remove.size) {
      this.contact.tags = [...new Set([...this.contact.tags, ...add])].filter(
        (t) => !remove.has(t),
      )
      this.events.push({
        kind: 'info',
        icon: 'pi pi-tag',
        text: [
          ...add.map((t) => `+${t}`),
          ...[...remove].map((t) => `−${t}`),
        ].join('  '),
      })
    }
    const sets = node.set_fields ?? {}
    if (Object.keys(sets).length) {
      const context = this.context()
      const applied = Object.fromEntries(
        Object.entries(sets).map(([k, v]) => [k, interpolate(String(v), context)]),
      )
      this.contact.fields = { ...this.contact.fields, ...applied }
    }
  }
}

// --- puertos 1:1 de engine.py -------------------------------------------------

export function interpolate(text: string, context: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) =>
    resolvePath(path, context),
  )
}

function resolvePath(path: string, context: Record<string, unknown>): string {
  let value: unknown = context
  for (const part of path.split('.')) {
    if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[part]
    } else {
      return ''
    }
  }
  return value == null ? '' : String(value)
}

function describeWhenShort(when: FlowNodeDef['when']): string {
  if (!when) return '¿?'
  if (when.tag) return `tag ${when.tag}`
  if (when.not_tag) return `sin tag ${when.not_tag}`
  return when.field ?? '¿?'
}

function evaluateWhen(
  when: NonNullable<FlowNodeDef['when']>,
  context: Record<string, unknown>,
): boolean {
  const tags = ((context.contact as Record<string, unknown>)?.tags ?? []) as string[]
  if (when.tag !== undefined) return tags.includes(String(when.tag))
  if (when.not_tag !== undefined) return !tags.includes(String(when.not_tag))

  const path = String(when.field ?? '')
  let value = resolvePath(path, context)
  if (value === '' && !path.includes('.')) {
    value = resolvePath(`contact.fields.${path}`, context)
  }
  const norm = (raw: unknown) => String(raw).trim().toLowerCase()
  if (when.equals !== undefined) return norm(value) === norm(when.equals)
  if (when.not_equals !== undefined) return norm(value) !== norm(when.not_equals)
  if (when.contains !== undefined) return norm(value).includes(norm(when.contains))
  if (when.exists !== undefined) return (value !== '') === Boolean(when.exists)
  return false
}

function formatMinutes(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} día(s)`
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hora(s)`
  return `${minutes} minuto(s)`
}

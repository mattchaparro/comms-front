<script setup lang="ts">
// La cajita de UN nodo en el canvas del builder, con la identidad propia
// de Connect y el lenguaje visual de ManyChat: el mensaje se ve como una
// burbuja de chat REAL, las {{variables}} salen como pills (no llaves
// crudas), los botones y las opciones de lista son filas de botón de
// WhatsApp con su punto de conexión propio, y la imagen del nodo
// multimedia se previsualiza en miniatura. La edición vive en el panel
// lateral del FlowBuilderView.
import { Handle, Position } from '@vue-flow/core'
import { computed } from 'vue'

import type { BuilderNodeData } from './graph'
import { NODE_CATALOG, sourceHandles } from './graph'

const props = defineProps<{
  id: string
  data: BuilderNodeData
  selected?: boolean
}>()

const meta = computed(() => NODE_CATALOG[props.data.def.type])
const handles = computed(() => sourceHandles(props.data.def))

// El texto de la burbuja, partido en tokens texto/variable para renderizar
// {{asi}} como pill (patron ManyChat: la variable es un chip, no llaves).
type Token = { kind: 'text' | 'var'; value: string }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  for (const match of text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
    if (match.index! > last) tokens.push({ kind: 'text', value: text.slice(last, match.index) })
    tokens.push({ kind: 'var', value: match[1] })
    last = match.index! + match[0].length
  }
  if (last < text.length) tokens.push({ kind: 'text', value: text.slice(last) })
  return tokens
}

const bubbleTokens = computed(() => {
  const def = props.data.def
  const text =
    def.type === 'media' ? (def.caption ?? '') : def.type === 'template' ? '' : (def.text ?? '')
  return text ? tokenize(text) : []
})

// El nodo `blocks` pinta su pila: cada bloque como lo veria la clienta.
const blockViews = computed(() =>
  (props.data.def.blocks ?? []).map((block) => ({
    block,
    tokens: tokenize(block.text ?? ''),
  })),
)

const BLOCK_MEDIA_ICONS: Record<string, string> = {
  image: 'pi pi-image',
  video: 'pi pi-video',
  audio: 'pi pi-volume-up',
  document: 'pi pi-paperclip',
}

// Nombre corto de la variable para el pill: contact.fields.ciudad -> ciudad.
function pillLabel(path: string): string {
  const parts = path.split('.')
  return parts[parts.length - 1] || path
}

const logicSummary = computed(() => {
  const def = props.data.def
  if (def.type === 'delay') return formatMinutes(def.minutes ?? 0)
  if (def.type === 'condition') {
    const count = def.cases?.length ?? (def.when ? 1 : 0)
    return count > 1
      ? `${count} casos, en orden — gana el primero que aplique`
      : describeWhen()
  }
  if (def.type === 'random') return `Reparte el tráfico en ${def.branches?.length ?? 0} ramas`
  return ''
})

function formatMinutes(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return `Esperar ${minutes / 1440} día(s)`
  if (minutes >= 60 && minutes % 60 === 0) return `Esperar ${minutes / 60} hora(s)`
  return `Esperar ${minutes} minuto(s)`
}

function describeWhen(): string {
  const when = props.data.def.when ?? props.data.def.cases?.[0]?.when ?? {}
  if (when.tag) return `¿Tiene el tag «${when.tag}»?`
  if (when.not_tag) return `¿NO tiene el tag «${when.not_tag}»?`
  if (when.field) {
    if (when.equals !== undefined) return `¿${when.field} = «${when.equals}»?`
    if (when.not_equals !== undefined) return `¿${when.field} ≠ «${when.not_equals}»?`
    if (when.contains !== undefined) return `¿${when.field} contiene «${when.contains}»?`
    if (when.exists !== undefined) return when.exists ? `¿${when.field} tiene valor?` : `¿${when.field} está vacío?`
  }
  return 'Condición sin configurar'
}

// Las lineas del nodo Acciones: una por accion, en su idioma.
const actionLines = computed(() => {
  const def = props.data.def
  if (def.type !== 'actions') return []
  return (def.actions ?? []).map((action) => {
    switch (action.type) {
      case 'add_tags':
        return { icon: 'pi pi-tag', text: (action.tags ?? []).map((t) => `+${t}`).join(' ') || '+…' }
      case 'remove_tags':
        return { icon: 'pi pi-tag', text: (action.tags ?? []).map((t) => `−${t}`).join(' ') || '−…' }
      case 'set_fields':
        return {
          icon: 'pi pi-pencil',
          text: `Fijar: ${Object.keys((action.fields as Record<string, string>) ?? {}).join(', ') || '…'}`,
        }
      case 'clear_fields':
        return { icon: 'pi pi-eraser', text: `Borrar: ${((action.fields as string[]) ?? []).join(', ') || '…'}` }
      case 'http_request': {
        let host = action.url ?? ''
        try {
          host = new URL(action.url ?? '').host
        } catch {
          /* url a medias mientras se escribe */
        }
        return { icon: 'pi pi-arrow-right-arrow-left', text: `Solicitud externa: ${host || '…'}` }
      }
      case 'notify_app':
        return { icon: 'pi pi-bell', text: `Avisar a tu app` }
      case 'start_flow':
        return { icon: 'pi pi-directions', text: `Ir al flujo «${action.flow || '…'}»` }
    }
  })
})

const effects = computed(() => {
  const def = props.data.def
  return [
    ...(def.add_tags ?? []).map((t) => `+${t}`),
    ...(def.remove_tags ?? []).map((t) => `−${t}`),
    ...Object.keys(def.set_fields ?? {}).map((k) => `${k}=…`),
  ]
})

// Nodos cuyo contenido se dibuja como burbuja de chat.
const isChat = computed(() =>
  ['message', 'buttons', 'cta_url', 'list', 'capture', 'media', 'template', 'product'].includes(
    props.data.def.type,
  ),
)

const productSummary = computed(() => {
  const def = props.data.def
  if (def.type !== 'product') return null
  if (def.sections?.length) {
    const total = def.sections.reduce((sum, s) => sum + s.retailer_ids.length, 0)
    return `${total} producto(s) en ${def.sections.length} sección(es)`
  }
  return def.retailer_id || '(sin producto elegido)'
})

// Las filas de opciones (botones / lista) se dibujan como botones de
// WhatsApp DENTRO de la tarjeta, cada una con su handle; el resto de
// handles (Sigue / Sí / No / ramas) van en el pie.
const isOptionRows = computed(() => ['buttons', 'list'].includes(props.data.def.type))

const isImagePreview = computed(
  () =>
    props.data.def.type === 'media' &&
    props.data.def.kind === 'image' &&
    (props.data.def.url ?? '').startsWith('http'),
)

const MEDIA_ICONS = {
  image: 'pi pi-image',
  video: 'pi pi-video',
  audio: 'pi pi-volume-up',
  document: 'pi pi-paperclip',
} as const

function handleColor(handleId: string): string {
  if (props.data.def.type === 'condition') {
    return handleId === 'else' ? '#f87171' : '#22c55e'
  }
  return meta.value.accent
}
</script>

<template>
  <div
    class="w-64 rounded-xl bg-white transition-shadow"
    :style="{
      boxShadow: selected
        ? `0 0 0 2px ${meta.accent}, 0 8px 20px -6px rgb(15 23 42 / 0.18)`
        : '0 0 0 1px rgb(226 232 240), 0 2px 8px -2px rgb(15 23 42 / 0.08)',
    }"
  >
    <Handle
      type="target"
      :position="Position.Left"
      class="!h-3 !w-3 !border-2 !bg-white"
      :style="{ borderColor: meta.accent }"
    />

    <div
      class="flex items-center gap-2 rounded-t-xl px-3 py-2"
      :style="{ backgroundColor: meta.headerBg }"
    >
      <i :class="meta.icon" class="text-xs" :style="{ color: meta.accent }" />
      <span class="truncate text-[13px] font-semibold text-slate-800">
        {{ data.def.title || meta.label }}
      </span>
      <span
        v-if="data.isStart"
        class="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
        :style="{ backgroundColor: meta.accent }"
      >
        Inicio
      </span>
    </div>

    <!-- nodo blocks: la pila de bloques, como la veria la clienta -->
    <div v-if="data.def.type === 'blocks'" class="flex flex-col gap-1.5 px-3 py-2">
      <template v-for="(view, index) in blockViews" :key="index">
        <!-- pausa corta -->
        <div
          v-if="view.block.type === 'wait'"
          class="self-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500"
        >
          <i class="pi pi-clock mr-1 text-[9px]" />{{ view.block.seconds }}s
        </div>

        <!-- multimedia -->
        <div
          v-else-if="['image', 'video', 'audio', 'document'].includes(view.block.type)"
          class="overflow-hidden rounded-lg rounded-tl-sm bg-[#f0f2f5]"
        >
          <img
            v-if="view.block.type === 'image' && (view.block.url ?? '').startsWith('http')"
            :src="view.block.url"
            class="max-h-20 w-full object-cover"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <div v-else class="flex h-12 items-center justify-center text-slate-300">
            <i :class="BLOCK_MEDIA_ICONS[view.block.type]" class="text-lg" />
          </div>
          <p v-if="view.block.caption" class="px-2 py-1 text-[11px] text-slate-700">
            {{ view.block.caption }}
          </p>
        </div>

        <!-- texto / cta / captura / lista -->
        <div v-else class="flex flex-col gap-1">
          <div class="rounded-lg rounded-tl-sm bg-[#f0f2f5] px-2.5 py-1.5">
            <p v-if="view.tokens.length" class="line-clamp-4 text-xs leading-relaxed text-slate-800">
              <template v-for="(token, tIndex) in view.tokens" :key="tIndex">
                <span
                  v-if="token.kind === 'var'"
                  class="mx-0.5 inline-block rounded bg-teal-600/10 px-1 py-px align-baseline text-[10px] font-semibold leading-tight text-teal-700"
                  :title="`{{${token.value}}}`"
                >
                  {{ pillLabel(token.value) }}
                </span>
                <template v-else>{{ token.value }}</template>
              </template>
            </p>
            <p v-else class="text-xs italic text-slate-400">Sin texto todavía…</p>
            <p v-if="view.block.type === 'capture'" class="mt-0.5 text-[10px] text-slate-500">
              <i class="pi pi-inbox mr-1 text-[9px]" />Guarda en
              <span class="rounded bg-white px-1 font-mono">{{ view.block.field || '¿?' }}</span>
            </p>
          </div>
          <p v-if="view.block.type === 'cta'" class="truncate text-center text-[10px] text-cyan-700">
            <i class="pi pi-external-link mr-1 text-[9px]" />{{ view.block.button || 'Abrir' }}
          </p>
          <p v-if="view.block.type === 'list'" class="text-center text-[10px] text-slate-400">
            <i class="pi pi-bars mr-1 text-[9px]" />{{ view.block.button || 'Ver opciones' }}
          </p>

          <!-- botones / filas de este bloque, conectables -->
          <div
            v-for="option in [...(view.block.buttons ?? []), ...(view.block.rows ?? [])]"
            :key="option.id"
            class="relative"
          >
            <div
              class="rounded-lg border border-slate-200 bg-white py-1 pr-4 text-center text-[11px] font-medium"
              :style="{ color: meta.accent }"
            >
              {{ option.title || '(opción)' }}
            </div>
            <Handle
              :id="`${view.block.rows ? 'row' : 'btn'}:${option.id}`"
              type="source"
              :position="Position.Right"
              class="!h-3 !w-3 !border-2 !bg-white"
              :style="{
                borderColor: meta.accent,
                position: 'absolute',
                right: '-18px',
                top: '50%',
                transform: 'translateY(-50%)',
              }"
            />
          </div>
        </div>
      </template>

      <div v-if="effects.length" class="flex flex-wrap gap-1">
        <span
          v-for="effect in effects"
          :key="effect"
          class="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700"
        >
          {{ effect }}
        </span>
      </div>

      <!-- Elegir Siguiente Paso -->
      <div class="relative -mx-3 mt-0.5 border-t border-slate-100 pt-1.5">
        <p class="pr-5 text-right text-[10px] text-slate-400">Siguiente paso</p>
        <Handle
          id="next"
          type="source"
          :position="Position.Right"
          class="!h-3 !w-3 !border-2 !bg-white"
          :style="{
            borderColor: meta.accent,
            position: 'absolute',
            right: '-6px',
            top: '60%',
            transform: 'translateY(-50%)',
          }"
        />
      </div>
    </div>

    <div v-else class="px-3 py-2">
      <!-- contenido tipo chat: la burbuja como la veria la clienta -->
      <template v-if="isChat">
        <div class="rounded-lg rounded-tl-sm bg-[#f0f2f5] px-2.5 py-1.5">
          <!-- miniatura de imagen (nodo multimedia) -->
          <img
            v-if="isImagePreview"
            :src="data.def.url"
            class="mb-1.5 max-h-24 w-full rounded-md object-cover"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <div
            v-else-if="data.def.type === 'media'"
            class="mb-1.5 flex h-14 items-center justify-center rounded-md bg-white text-slate-300"
          >
            <i :class="MEDIA_ICONS[data.def.kind ?? 'image']" class="text-xl" />
          </div>

          <!-- plantilla: referencia compacta -->
          <p v-if="data.def.type === 'template'" class="text-xs leading-relaxed text-slate-700">
            <i class="pi pi-file-check mr-1 text-[10px] text-fuchsia-600" />
            <template v-if="data.def.template">
              Plantilla <span class="font-semibold">{{ data.def.template }}</span>
              <span class="text-slate-400"> · {{ data.def.language || 'es' }}</span>
            </template>
            <span v-else class="italic text-slate-400">Sin plantilla elegida…</span>
          </p>

          <!-- texto con pills de variables -->
          <p
            v-else-if="bubbleTokens.length"
            class="line-clamp-4 text-xs leading-relaxed text-slate-800"
          >
            <template v-for="(token, index) in bubbleTokens" :key="index">
              <span
                v-if="token.kind === 'var'"
                class="mx-0.5 inline-block rounded bg-teal-600/10 px-1 py-px align-baseline text-[10px] font-semibold leading-tight text-teal-700"
                :title="`{{${token.value}}}`"
              >
                {{ pillLabel(token.value) }}
              </span>
              <template v-else>{{ token.value }}</template>
            </template>
          </p>
          <p
            v-else-if="data.def.type !== 'media'"
            class="text-xs italic leading-relaxed text-slate-400"
          >
            Sin texto todavía…
          </p>
        </div>

        <!-- pie contextual por tipo -->
        <p v-if="data.def.type === 'cta_url'" class="mt-1 truncate text-[11px] text-cyan-700">
          <i class="pi pi-link mr-1 text-[10px]" />{{ data.def.url }}
        </p>
        <p v-if="data.def.type === 'capture'" class="mt-1 truncate text-[11px] font-medium text-slate-600">
          <i class="pi pi-inbox mr-1 text-[10px]" />Guarda en:
          <span class="rounded bg-slate-100 px-1 font-mono text-[10px]">{{ data.def.field || '(sin campo)' }}</span>
        </p>
        <p v-if="data.def.type === 'list'" class="mt-1 text-center text-[11px] text-slate-400">
          <i class="pi pi-bars mr-1 text-[10px]" />{{ data.def.button || 'Ver opciones' }}
        </p>
        <p v-if="data.def.type === 'product'" class="mt-1 truncate text-[11px] font-medium text-rose-700">
          <i class="pi pi-shopping-bag mr-1 text-[10px]" />{{ productSummary }}
        </p>
      </template>

      <!-- nodo acciones: la lista de acciones -->
      <div v-else-if="data.def.type === 'actions'" class="flex flex-col gap-1">
        <p
          v-for="(line, index) in actionLines"
          :key="index"
          class="truncate text-[11px] font-medium text-slate-600"
        >
          <i :class="line.icon" class="mr-1.5 text-[10px] text-yellow-600" />{{ line.text }}
        </p>
      </div>

      <!-- nodos de logica: resumen plano -->
      <p v-else class="text-xs font-medium leading-relaxed text-slate-600">{{ logicSummary }}</p>

      <div v-if="effects.length" class="mt-1.5 flex flex-wrap gap-1">
        <span
          v-for="effect in effects"
          :key="effect"
          class="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700"
        >
          {{ effect }}
        </span>
      </div>
    </div>

    <!-- filas de opciones como botones de WhatsApp (cada una conecta) -->
    <div v-if="data.def.type !== 'blocks' && isOptionRows" class="flex flex-col gap-1 px-3 pb-2">
      <div v-for="handle in handles" :key="handle.id" class="relative">
        <div
          class="rounded-lg border border-slate-200 bg-white py-1 pr-4 text-center text-[11px] font-medium"
          :style="{ color: meta.accent }"
        >
          {{ handle.label }}
        </div>
        <Handle
          :id="handle.id"
          type="source"
          :position="Position.Right"
          class="!h-3 !w-3 !border-2 !bg-white"
          :style="{
            borderColor: meta.accent,
            position: 'absolute',
            right: '-18px',
            top: '50%',
            transform: 'translateY(-50%)',
          }"
        />
      </div>
    </div>

    <!-- salidas simples / de logica en el pie -->
    <div
      v-else-if="data.def.type !== 'blocks'"
      class="flex flex-col gap-1.5 border-t border-slate-100 py-2"
    >
      <div v-for="handle in handles" :key="handle.id" class="relative flex items-center justify-end pr-4">
        <span
          v-if="data.def.type === 'condition'"
          class="mr-1 inline-block h-2 w-2 rounded-full"
          :style="{ backgroundColor: handleColor(handle.id) }"
        />
        <span class="truncate text-[11px] text-slate-500">{{ handle.label }}</span>
        <Handle
          :id="handle.id"
          type="source"
          :position="Position.Right"
          class="!h-3 !w-3 !border-2 !bg-white"
          :style="{
            borderColor: handleColor(handle.id),
            position: 'absolute',
            right: '-6px',
            top: '50%',
            transform: 'translateY(-50%)',
          }"
        />
      </div>
    </div>
  </div>
</template>

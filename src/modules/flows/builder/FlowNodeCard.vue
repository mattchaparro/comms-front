<script setup lang="ts">
// La cajita de UN nodo en el canvas del builder, con la identidad propia
// de Connect: tarjeta blanca, franja pastel con texto oscuro por
// categoria, y el texto del mensaje renderizado como burbuja de chat.
// Entrada por la izquierda, salidas por la derecha: una por botón en
// `buttons`, Sí/No en `condition`, una sola en el resto. La edición vive
// en el panel lateral del FlowBuilderView.
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

const summary = computed(() => {
  const def = props.data.def
  if (def.type === 'delay') return formatMinutes(def.minutes ?? 0)
  if (def.type === 'condition') return describeWhen()
  return def.text || 'Sin texto todavía…'
})

function formatMinutes(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return `Esperar ${minutes / 1440} día(s)`
  if (minutes >= 60 && minutes % 60 === 0) return `Esperar ${minutes / 60} hora(s)`
  return `Esperar ${minutes} minuto(s)`
}

function describeWhen(): string {
  const when = props.data.def.when ?? {}
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

const effects = computed(() => {
  const def = props.data.def
  return [
    ...(def.add_tags ?? []).map((t) => `+${t}`),
    ...(def.remove_tags ?? []).map((t) => `−${t}`),
    ...Object.keys(def.set_fields ?? {}).map((k) => `${k}=…`),
  ]
})

const isBubble = computed(() => ['message', 'buttons', 'cta_url'].includes(props.data.def.type))
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
      <span class="text-[13px] font-semibold text-slate-800">{{ meta.label }}</span>
      <span
        v-if="data.isStart"
        class="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
        :style="{ backgroundColor: meta.accent }"
      >
        Inicio
      </span>
    </div>

    <div class="px-3 py-2">
      <p
        v-if="isBubble"
        class="line-clamp-3 rounded-lg rounded-tl-sm bg-slate-100 px-2.5 py-1.5 text-xs leading-relaxed text-slate-700"
      >
        {{ summary }}
      </p>
      <p v-else class="text-xs font-medium leading-relaxed text-slate-600">{{ summary }}</p>

      <p v-if="data.def.type === 'cta_url'" class="mt-1 truncate text-[11px] text-emerald-700">
        <i class="pi pi-link mr-1 text-[10px]" />{{ data.def.url }}
      </p>

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

    <div class="flex flex-col gap-1.5 border-t border-slate-100 py-2">
      <div v-for="handle in handles" :key="handle.id" class="relative flex items-center justify-end pr-4">
        <span
          v-if="data.def.type === 'condition'"
          class="mr-1 inline-block h-2 w-2 rounded-full"
          :style="{ backgroundColor: handle.id === 'then' ? '#22c55e' : '#f87171' }"
        />
        <span class="truncate text-[11px] text-slate-500">{{ handle.label }}</span>
        <Handle
          :id="handle.id"
          type="source"
          :position="Position.Right"
          class="!h-3 !w-3 !border-2 !bg-white"
          :style="{
            borderColor:
              data.def.type === 'condition'
                ? handle.id === 'then'
                  ? '#22c55e'
                  : '#f87171'
                : meta.accent,
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

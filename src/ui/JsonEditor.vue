<script setup lang="ts">
// Editor JSON del panel: el "modo avanzado" de Flujos y el editor de
// Formularios (WhatsApp Flows). Textarea plano a propósito (sin Monaco ni
// CodeMirror: cientos de KB por un editor que se usa de vez en cuando),
// con lo mínimo que hace falta para trabajar un JSON largo: numeración de
// líneas, aviso de JSON inválido en vivo, Tab que indenta y `goToLine()`
// para saltar al error que reportó Meta (sus errores vienen por línea).
import { computed, ref } from 'vue'

const model = defineModel<string>({ required: true })

const props = withDefaults(
  defineProps<{
    /** Alto del área editable, en líneas visibles. */
    rows?: number
    readonly?: boolean
    /** Línea resaltada en la numeración (p.ej. la del error seleccionado). */
    highlightLine?: number | null
  }>(),
  { rows: 18, readonly: false, highlightLine: null },
)

const textarea = ref<HTMLTextAreaElement | null>(null)
const gutter = ref<HTMLDivElement | null>(null)

const lineCount = computed(() => model.value.split('\n').length)

const parseError = computed<string | null>(() => {
  if (!model.value.trim()) return null
  try {
    JSON.parse(model.value)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'JSON inválido'
  }
})

function syncScroll(): void {
  if (gutter.value && textarea.value) gutter.value.scrollTop = textarea.value.scrollTop
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || props.readonly || !textarea.value) return
  event.preventDefault()
  const el = textarea.value
  const { selectionStart, selectionEnd } = el
  model.value = `${model.value.slice(0, selectionStart)}  ${model.value.slice(selectionEnd)}`
  requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2))
}

/** Selecciona la línea `line` (1-based) y la trae a la vista. */
function goToLine(line: number): void {
  const el = textarea.value
  if (!el) return
  const lines = model.value.split('\n')
  const target = Math.min(Math.max(line, 1), lines.length)
  const start = lines.slice(0, target - 1).reduce((sum, text) => sum + text.length + 1, 0)
  el.focus()
  el.setSelectionRange(start, start + lines[target - 1].length)
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 16
  el.scrollTop = Math.max(0, (target - 3) * lineHeight)
  syncScroll()
}

defineExpose({ goToLine })
</script>

<template>
  <div class="flex flex-col gap-1">
    <div
      class="flex overflow-hidden rounded-md border font-mono text-xs leading-5"
      :class="parseError ? 'border-red-300' : 'border-slate-300 focus-within:border-primary'"
    >
      <div
        ref="gutter"
        aria-hidden="true"
        class="select-none overflow-hidden bg-slate-50 px-2 py-2 text-right text-slate-400"
        :style="{ height: `calc(${rows} * 1.25rem + 1rem)` }"
      >
        <div
          v-for="n in lineCount"
          :key="n"
          :class="n === highlightLine ? 'rounded bg-amber-200 text-amber-900' : ''"
        >
          {{ n }}
        </div>
      </div>
      <textarea
        ref="textarea"
        v-model="model"
        :readonly="readonly"
        spellcheck="false"
        wrap="off"
        class="min-w-0 flex-1 resize-none bg-white p-2 outline-none"
        :class="readonly ? 'text-slate-500' : 'text-slate-800'"
        :style="{ height: `calc(${rows} * 1.25rem + 1rem)` }"
        @scroll="syncScroll"
        @keydown="onKeydown"
      />
    </div>
    <p v-if="parseError" class="text-xs text-red-600">JSON inválido: {{ parseError }}</p>
  </div>
</template>

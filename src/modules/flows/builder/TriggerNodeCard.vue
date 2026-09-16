<script setup lang="ts">
// El nodo "Cuando..." del canvas (patron ManyChat): la puerta de entrada
// del flujo. No es un nodo de la definicion - su arista "Entonces" define
// el `start`, y hacer clic en el abre la configuracion del disparador.
import { Handle, Position } from '@vue-flow/core'

import type { TriggerNodeData } from './graph'

defineProps<{
  id: string
  data: TriggerNodeData
  selected?: boolean
}>()
</script>

<template>
  <div
    class="w-60 rounded-xl bg-white transition-shadow"
    :style="{
      boxShadow: selected
        ? '0 0 0 2px #0f172a, 0 8px 20px -6px rgb(15 23 42 / 0.18)'
        : '0 0 0 1px rgb(226 232 240), 0 2px 8px -2px rgb(15 23 42 / 0.08)',
    }"
  >
    <div class="flex items-center gap-2 rounded-t-xl bg-slate-900 px-3 py-2">
      <i class="pi pi-bolt text-xs text-amber-400" />
      <span class="text-[13px] font-semibold text-white">Cuando…</span>
    </div>

    <div class="px-3 py-2.5">
      <template v-if="data.triggerType === 'keyword'">
        <p class="text-xs font-medium text-slate-700">El cliente escribe una palabra clave</p>
        <div class="mt-1.5 flex flex-wrap gap-1">
          <span
            v-for="keyword in data.keywords"
            :key="keyword"
            class="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700"
          >
            {{ keyword }}
          </span>
          <span v-if="!data.keywords.length" class="text-[11px] italic text-slate-400">
            Sin palabras clave todavía
          </span>
        </div>
      </template>
      <template v-else>
        <p class="text-xs font-medium text-slate-700">Tu app lo dispara (API)</p>
        <p class="mt-0.5 text-[11px] leading-snug text-slate-400">
          Por ejemplo, al agendar una cita: <code class="text-[10px]">POST /v1/flows/trigger</code>
        </p>
      </template>
      <p class="mt-2 text-[11px] text-teal-600">Editar disparador</p>
    </div>

    <div class="relative flex items-center justify-end border-t border-slate-100 py-2 pr-4">
      <span class="text-[11px] text-slate-500">Entonces</span>
      <Handle
        id="start"
        type="source"
        :position="Position.Right"
        class="!h-3 !w-3 !border-2 !bg-white"
        :style="{
          borderColor: '#0d9488',
          position: 'absolute',
          right: '-6px',
          top: '50%',
          transform: 'translateY(-50%)',
        }"
      />
    </div>
  </div>
</template>

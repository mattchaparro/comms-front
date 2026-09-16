<script setup lang="ts">
// El wordmark propio de Nexolu Connect (pendiente un asset definitivo de
// marca - plan maestro, iteracion 6.4): glifo de burbuja de conversacion
// con nodo conectado, en degradado azul->teal, + "Nexolú Connect" en
// texto. Sustituye al PNG que compartia el badge del POS.
defineProps<{ compact?: boolean }>()
</script>

<template>
  <div class="flex items-center gap-2.5">
    <span
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-teal-400 shadow-sm"
    >
      <svg viewBox="0 0 24 24" fill="none" class="h-5 w-5 text-white">
        <path
          d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-4.2 3.4c-.66.53-1.8.1-1.8-.87z"
          fill="currentColor"
          opacity="0.9"
        />
        <circle cx="9" cy="9.5" r="1.4" fill="#2563eb" />
        <circle cx="15" cy="9.5" r="1.4" fill="#2563eb" />
        <path d="M10.4 9.5h3.2" stroke="#2563eb" stroke-width="1.1" />
      </svg>
    </span>
    <span v-if="!compact" class="whitespace-nowrap text-lg font-bold leading-none text-slate-900">
      Nexolú
      <span class="bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">Connect</span>
    </span>
  </div>
</template>

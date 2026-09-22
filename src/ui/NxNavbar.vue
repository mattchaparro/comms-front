<script setup lang="ts">
// Barra superior con la identidad de Connect: blanca con borde inferior,
// nombre en texto oscuro y salir discreto. En movil lleva el boton del
// menu (NxSidebar) y el wordmark; en escritorio ambos ya estan en el
// sidebar.
import ConnectWordmark from './ConnectWordmark.vue'

defineProps<{
  userName: string
}>()

const emit = defineEmits<{ logout: []; menu: [] }>()
</script>

<template>
  <header
    class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 sm:h-16 sm:px-6"
  >
    <button
      type="button"
      class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 active:bg-slate-100 lg:hidden"
      aria-label="Abrir menú"
      @click="emit('menu')"
    >
      <i class="pi pi-bars text-lg" />
    </button>
    <div class="lg:hidden">
      <ConnectWordmark />
    </div>
    <div class="ml-auto flex items-center gap-1 sm:gap-3">
      <slot name="actions" />
      <span class="hidden text-sm text-slate-600 sm:inline">{{ userName }}</span>
      <button
        type="button"
        class="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 sm:px-3"
        aria-label="Salir"
        @click="emit('logout')"
      >
        <i class="pi pi-sign-out" />
        <span class="hidden sm:inline">Salir</span>
      </button>
    </div>
  </header>
</template>

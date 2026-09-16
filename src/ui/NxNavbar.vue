<script setup lang="ts">
// Barra superior con la identidad de Connect: blanca con borde inferior,
// nombre en texto oscuro y salir discreto. El wordmark solo aparece en
// movil (en escritorio ya esta en el sidebar).
import ConnectWordmark from './ConnectWordmark.vue'

defineProps<{
  userName: string
}>()

const emit = defineEmits<{ logout: [] }>()
</script>

<template>
  <header
    class="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6"
  >
    <div class="lg:hidden">
      <ConnectWordmark />
    </div>
    <div class="ml-auto flex items-center gap-3">
      <slot name="actions" />
      <span class="hidden text-sm text-slate-600 sm:inline">{{ userName }}</span>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        @click="emit('logout')"
      >
        <i class="pi pi-sign-out" />
        Salir
      </button>
    </div>
  </header>
</template>

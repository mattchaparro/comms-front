<script setup lang="ts">
// Barra superior, calcada de Components/NavBarProfile.vue del legacy
// (mismo fondo indigo-900, mismo lugar para nombre + salir, mismo logo
// -ApplicationMark- en la esquina movil). El dropdown de perfil/ayuda
// del legacy queda para cuando tengamos NxDropdown - por ahora el
// nombre y el boton de salir van directos.
//
// No usa NxButton a proposito: sus variantes estan pensadas para fondo
// claro (texto slate-700) y forzarlo a blanco via `class` pelea con las
// utilidades internas del componente sin garantia de quien gana la
// especificidad CSS - mas simple y confiable un boton nativo aca.
defineProps<{
  logo: string
  userName: string
}>()

const emit = defineEmits<{ logout: [] }>()
</script>

<template>
  <header class="flex h-16 items-center justify-between bg-indigo-900 px-4 sm:px-6">
    <img :src="logo" alt="Nexolú Admin" class="h-9 w-auto rounded-lg bg-white px-2 py-1 lg:hidden" />
    <div class="ml-auto flex items-center gap-3">
      <slot name="actions" />
      <span class="hidden text-sm text-white/80 sm:inline">{{ userName }}</span>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
        @click="emit('logout')"
      >
        <i class="pi pi-sign-out" />
        Salir
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
// Shell con sub-navegacion para los paneles de Comms Core (Apps/Registros) -
// mismo patron que IaCoreView.vue (rutas de verdad, no PrimeVue Tabs, para
// poder compartir el link directo a cada panel).
const tabs = [
  { label: 'Apps', routeName: 'comms-core.apps' },
  { label: 'Registros', routeName: 'comms-core.logs' },
]
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Comunicaciones</h1>
    </div>

    <nav class="mb-6 flex gap-1 border-b border-slate-200">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.routeName"
        :to="{ name: tab.routeName }"
        class="border-b-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
        active-class="border-indigo-600 text-indigo-600 hover:text-indigo-600"
        :class="{ 'border-transparent': true }"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>

    <router-view />
  </div>
</template>

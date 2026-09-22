<script setup lang="ts">
// Sidebar de escritorio + menu lateral deslizable en movil, con la
// identidad propia de Connect (blanco, texto oscuro, item activo en azul
// suave - el lenguaje de las herramientas de automatizacion, no el indigo
// del POS). PrimeIcons para todo el chrome de la app.
//
// En movil ya NO hay barra inferior fija: tapaba la caja de escribir del
// chat -- la pantalla que mas se usa desde el celular -- y con diez
// secciones se volvia una tira que habia que deslizar para encontrar
// algo. El menu se abre con el boton de la barra superior (NxNavbar).
import Drawer from 'primevue/drawer'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import type { NavItem } from '@/types/navigation'

import ConnectWordmark from './ConnectWordmark.vue'

defineProps<{
  items: NavItem[]
}>()

/** El menu movil, abierto/cerrado desde la barra superior. */
const mobileOpen = defineModel<boolean>('mobileOpen', { default: false })

const collapsed = ref(false)
const route = useRoute()

// Al elegir una seccion el menu se cierra solo: quedarse abierto tapando
// la pantalla que se acaba de pedir obliga a un toque de mas.
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
  },
)

function isActive(item: NavItem): boolean {
  return Boolean(item.routeName) && route.name === item.routeName
}

function linkTarget(item: NavItem) {
  return { name: item.routeName }
}
</script>

<template>
  <aside
    :class="collapsed ? 'w-16' : 'w-64'"
    class="hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 lg:flex"
  >
    <div class="flex items-center px-4 py-5" :class="collapsed ? 'justify-center px-2' : ''">
      <ConnectWordmark :compact="collapsed" />
    </div>

    <button
      type="button"
      class="mx-3 mb-2 flex items-center justify-end rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      :title="collapsed ? 'Expandir menú' : 'Colapsar menú'"
      @click="collapsed = !collapsed"
    >
      <i :class="collapsed ? 'pi pi-angle-right' : 'pi pi-angle-left'" />
    </button>

    <nav class="flex-1 overflow-y-auto px-3 pb-4">
      <ul class="space-y-0.5">
        <li v-for="item in items" :key="item.label">
          <RouterLink
            v-if="!item.disabled && item.routeName"
            :to="linkTarget(item)"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            :class="
              isActive(item)
                ? 'bg-teal-50 text-teal-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            "
          >
            <i :class="item.icon" class="w-5 text-center text-lg" />
            <span v-if="!collapsed">{{ item.label }}</span>
          </RouterLink>
          <span
            v-else
            class="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300"
            :title="item.disabled ? 'Próximamente' : undefined"
          >
            <i :class="item.icon" class="w-5 text-center text-lg" />
            <span v-if="!collapsed">{{ item.label }}</span>
          </span>
        </li>
      </ul>
    </nav>
  </aside>

  <Drawer v-model:visible="mobileOpen" position="left" class="!w-72 lg:!hidden" :show-close-icon="true">
    <template #header>
      <ConnectWordmark />
    </template>
    <nav>
      <ul class="space-y-1">
        <li v-for="item in items" :key="item.label">
          <RouterLink
            v-if="!item.disabled && item.routeName"
            :to="linkTarget(item)"
            class="flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors"
            :class="isActive(item) ? 'bg-teal-50 text-teal-700' : 'text-slate-700 active:bg-slate-100'"
          >
            <i :class="item.icon" class="w-6 text-center text-lg" />
            {{ item.label }}
          </RouterLink>
          <span
            v-else
            class="flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium text-slate-300"
          >
            <i :class="item.icon" class="w-6 text-center text-lg" />
            {{ item.label }}
            <span class="ml-auto text-[10px] uppercase">Pronto</span>
          </span>
        </li>
      </ul>
    </nav>
  </Drawer>
</template>

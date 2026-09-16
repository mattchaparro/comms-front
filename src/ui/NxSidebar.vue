<script setup lang="ts">
// Sidebar de escritorio + barra inferior movil, con la identidad propia
// de Connect (blanco, texto oscuro, item activo en azul suave - el
// lenguaje de las herramientas de automatizacion, no el indigo del POS).
// PrimeIcons para todo el chrome de la app.
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import type { NavItem } from '@/types/navigation'

import ConnectWordmark from './ConnectWordmark.vue'

defineProps<{
  items: NavItem[]
}>()

const collapsed = ref(false)
const route = useRoute()

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
    class="hidden flex-col border-r border-slate-200 bg-white transition-all duration-200 lg:flex"
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

  <nav
    class="fixed bottom-0 z-20 w-full overflow-x-auto border-t border-slate-200 bg-white shadow-lg lg:hidden"
  >
    <ul class="m-auto flex w-max min-w-full flex-row items-center justify-evenly px-1 py-1.5">
      <li v-for="item in items" :key="item.label" class="shrink-0">
        <RouterLink
          v-if="!item.disabled && item.routeName"
          :to="linkTarget(item)"
          class="flex min-h-[60px] min-w-[68px] flex-col items-center justify-center rounded-xl px-2.5 py-2"
        >
          <i
            :class="[
              item.icon,
              'text-2xl leading-none',
              isActive(item) ? 'text-teal-600' : 'text-slate-500',
            ]"
          />
          <span
            class="mt-1 max-w-[5rem] truncate text-center text-xs font-medium leading-tight"
            :class="isActive(item) ? 'text-teal-700 font-bold' : 'text-slate-500'"
          >
            {{ item.label }}
          </span>
        </RouterLink>
        <span
          v-else
          class="flex min-h-[60px] min-w-[68px] flex-col items-center justify-center rounded-xl px-2.5 py-2"
          :title="item.disabled ? 'Próximamente' : undefined"
        >
          <i :class="item.icon" class="text-2xl leading-none text-slate-300" />
          <span
            class="mt-1 max-w-[5rem] truncate text-center text-xs font-medium leading-tight text-slate-300"
          >
            {{ item.label }}
          </span>
        </span>
      </li>
    </ul>
  </nav>
</template>

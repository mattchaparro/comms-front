<script setup lang="ts">
// La campana de la barra superior: activar o apagar los avisos al celular
// de ESTE navegador. El estado se muestra tal cual (activados, bloqueados,
// hay que instalar) porque "no me llega nada" casi siempre es uno de esos.
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import { useToast } from 'primevue/usetoast'
import { computed, onMounted, ref } from 'vue'

import {
  getPushState,
  type PushState,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/services/push/pushService'

const toast = useToast()
const state = ref<PushState | null>(null)
const busy = ref(false)
const panel = ref<InstanceType<typeof Popover> | null>(null)

async function refresh(): Promise<void> {
  try {
    state.value = await getPushState()
  } catch {
    state.value = 'unavailable'
  }
}

onMounted(refresh)

const icon = computed(() => (state.value === 'on' ? 'pi pi-bell' : 'pi pi-bell-slash'))

const copy = computed(() => {
  switch (state.value) {
    case 'on':
      return 'Te avisamos en este dispositivo cada vez que alguien escribe.'
    case 'off':
      return 'Actívalos para enterarte de cada mensaje aunque tengas el panel cerrado.'
    case 'denied':
      return 'Están bloqueados para este sitio. Permítelos en la configuración del navegador (el candado junto a la dirección) y vuelve a intentar.'
    case 'needs-install':
      return 'En iPhone los avisos solo funcionan con Connect instalado: toca Compartir → «Añadir a pantalla de inicio», ábrelo desde ese ícono y actívalos ahí.'
    case 'unavailable':
      return 'Los avisos todavía no están disponibles en este servidor.'
    case 'unsupported':
      return 'Este navegador no puede recibir avisos. Prueba con Chrome.'
    default:
      return ''
  }
})

async function enable(): Promise<void> {
  busy.value = true
  try {
    state.value = await subscribeToPush()
    if (state.value === 'on') {
      toast.add({ severity: 'success', summary: 'Avisos activados', life: 3000 })
    }
  } catch {
    toast.add({ severity: 'error', summary: 'No se pudieron activar los avisos', life: 5000 })
    await refresh()
  } finally {
    busy.value = false
  }
}

async function disable(): Promise<void> {
  busy.value = true
  try {
    await unsubscribeFromPush()
  } catch {
    toast.add({ severity: 'error', summary: 'No se pudieron desactivar', life: 5000 })
  } finally {
    busy.value = false
    await refresh()
  }
}

async function test(): Promise<void> {
  busy.value = true
  try {
    const sent = await sendTestPush()
    toast.add({
      severity: sent ? 'success' : 'warn',
      summary: sent ? 'Aviso de prueba enviado' : 'No salió ningún aviso',
      detail: sent ? undefined : 'Desactívalos y actívalos de nuevo.',
      life: 4000,
    })
  } catch {
    toast.add({ severity: 'error', summary: 'No se pudo enviar la prueba', life: 5000 })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <button
    v-if="state !== null"
    type="button"
    class="relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
    :class="state === 'on' ? 'text-teal-700' : 'text-slate-500'"
    :aria-label="state === 'on' ? 'Avisos activados' : 'Activar avisos'"
    @click="panel?.toggle($event)"
  >
    <i :class="icon" class="text-lg" />
    <span
      v-if="state === 'off'"
      class="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-500"
      aria-hidden="true"
    />
  </button>

  <Popover ref="panel">
    <div class="w-72 space-y-3">
      <div class="flex items-center gap-2">
        <i :class="icon" class="text-teal-700" />
        <span class="font-medium text-slate-800">
          {{ state === 'on' ? 'Avisos activados' : 'Avisos al celular' }}
        </span>
      </div>
      <p class="text-sm leading-snug text-slate-600">{{ copy }}</p>
      <div class="flex flex-wrap gap-2">
        <Button
          v-if="state === 'off'"
          label="Activar avisos"
          icon="pi pi-bell"
          size="small"
          :loading="busy"
          @click="enable"
        />
        <template v-else-if="state === 'on'">
          <Button label="Probar" icon="pi pi-send" size="small" :loading="busy" @click="test" />
          <Button
            label="Desactivar"
            severity="secondary"
            size="small"
            outlined
            :disabled="busy"
            @click="disable"
          />
        </template>
        <Button
          v-else-if="state === 'denied'"
          label="Ya los permití"
          size="small"
          severity="secondary"
          outlined
          @click="enable"
        />
      </div>
    </div>
  </Popover>
</template>

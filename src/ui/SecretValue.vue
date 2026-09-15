<script setup lang="ts">
// Un valor secreto oculto por defecto, con boton de "ojo" para revelarlo
// puntualmente y boton de copiar - mismo patron que las variables
// is_secret del editor de .env (ver EnvFileEditor.vue en el modulo infra).
import Button from 'primevue/button'
import { useClipboard } from '@vueuse/core'
import { ref } from 'vue'

const props = defineProps<{ label: string; value: string }>()

const revealed = ref(false)
const { copy, copied } = useClipboard()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <span class="text-sm font-medium text-slate-700">{{ props.label }}</span>
    <div class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <code class="flex-1 truncate text-sm">{{ revealed ? props.value : '•'.repeat(24) }}</code>
      <Button
        :icon="revealed ? 'pi pi-eye-slash' : 'pi pi-eye'"
        text
        size="small"
        :aria-label="revealed ? `Ocultar ${props.label}` : `Revelar ${props.label}`"
        @click="revealed = !revealed"
      />
      <Button icon="pi pi-copy" text size="small" :aria-label="`Copiar ${props.label}`" @click="copy(props.value)" />
    </div>
    <p v-if="copied" class="text-xs text-emerald-600">Copiado al portapapeles.</p>
  </div>
</template>

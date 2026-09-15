<script setup lang="ts">
import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { watch } from 'vue'

import { useFlashStore } from '@/stores/flash.store'

// Puente para mensajes disparados fuera de un componente (router guard,
// interceptor de axios) - ver src/stores/flash.store.ts.
const flash = useFlashStore()
const toast = useToast()

watch(
  () => flash.message,
  (msg) => {
    if (msg) {
      toast.add({ severity: flash.severity, summary: msg, life: 2200 })
      flash.clear()
    }
  },
)
</script>

<template>
  <router-view />
  <Toast position="top-center" />
  <ConfirmDialog />
</template>

import { ref } from 'vue'
import { defineStore } from 'pinia'

// Puente entre codigo que no es un componente (router guard, interceptor de
// axios en services/http/client.ts) y el toast de PrimeVue (useToast() solo
// funciona dentro de un setup()). App.vue observa `message` una vez y
// dispara el toast - mismo patron que nexolu-pos-front (flash.store.ts).
export const useFlashStore = defineStore('flash', () => {
  const message = ref<string | null>(null)
  const severity = ref<'success' | 'info' | 'warn' | 'error'>('info')

  function set(msg: string, sev: typeof severity.value = 'info'): void {
    message.value = msg
    severity.value = sev
  }

  function clear(): void {
    message.value = null
  }

  return { message, severity, set, clear }
})

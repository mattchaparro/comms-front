import '@fontsource/lato/400.css'
import '@fontsource/lato/700.css'
import 'primeicons/primeicons.css'
import './style.css'

import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import ConfirmationService from 'primevue/confirmationservice'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import { stashSsoAssertionFromUrl } from './services/http/ssoAssertion'
import { queryClient } from './services/query/queryClient'
import { nexoluPreset } from './theme/nexoluPreset'

// Antes de montar la app: al volver de nexolu-auth la asercion llega en el
// fragmento de la URL y la primera navegacion de vue-router lo descarta -
// dentro de un guard ya seria tarde.
stashSsoAssertionFromUrl()

const app = createApp(App)

app.use(createPinia())
app.use(router)
// Mismo tema que nexolu-pos-front (Aura + indigo de marca) - sin capa
// Nexolu UI aca, este preset es lo unico que mantiene la identidad visual
// compartida entre las dos SPAs (ver theme/nexoluPreset.ts).
app.use(PrimeVue, {
  theme: { preset: nexoluPreset, options: { darkModeSelector: false } },
  license: import.meta.env.VITE_PRIMEVUE_LICENSE_KEY,
})
app.use(VueQueryPlugin, { queryClient })
app.use(ToastService)
app.use(ConfirmationService)

app.mount('#app')

<script setup lang="ts">
/*
 * La bandeja de Connect, vista desde el panel de otra app.
 *
 * Es la MISMA pantalla: monta `ChatView` tal cual. Ese es el punto
 * entero -- la bandeja estaba escrita dos veces (acá y, más pobre,
 * dentro del Spa) y cada mejora había que hacerla dos veces o dejar una
 * atrás. Si esta vista copiara aunque fuera un pedazo de ChatView,
 * volveríamos al mismo problema por otro camino.
 *
 * Lo único que hace es la credencial. El panel que nos embebe pide un
 * token a su propio backend y nos lo pasa por la URL; acá se guarda en
 * memoria (nunca en localStorage, que es del panel y puede ser de un
 * administrador) y todas las peticiones salen con él.
 *
 * Sin token no se pinta nada, ni siquiera un login: quien entra acá sin
 * credencial no es alguien que se equivocó de página, es alguien
 * probando la URL.
 */
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { embedToken } from '@/services/http/embedToken'

import ChatView from './ChatView.vue'

const route = useRoute()
const listo = ref(false)

onMounted(() => {
  const token = String(route.query.t ?? '')

  if (!token) return

  embedToken.set(token)
  listo.value = true

  /*
   * El token dura quince minutos y esta pantalla se queda abierta toda
   * la tarde. El panel que nos embebe manda uno nuevo cuando le toca --
   * nosotros solo escuchamos, y solo a él: sin comprobar el origen,
   * cualquier página que nos metiera en un iframe podría inyectarnos una
   * credencial.
   */
  window.addEventListener('message', (evento: MessageEvent) => {
    if (evento.origin !== new URL(document.referrer || location.href).origin) return
    if (evento.data?.tipo !== 'nexolu:embed-token') return
    if (typeof evento.data.token !== 'string' || !evento.data.token) return

    embedToken.set(evento.data.token)
  })
})
</script>

<template>
  <ChatView v-if="listo" />

  <div v-else class="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">
    Esta pantalla se abre desde el panel de tu negocio.
  </div>
</template>

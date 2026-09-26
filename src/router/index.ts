import { isAxiosError } from 'axios'
import { createRouter, createWebHistory } from 'vue-router'

import { ssoAssertion, ssoError } from '@/services/http/ssoAssertion'
import { ticketError } from '@/services/http/ticketError'
import { useAuthStore } from '@/stores/auth.store'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresPlatform?: boolean
  }
}

// A diferencia de nexolu-admin-front, aca NO hay concepto de ambiente en la
// URL (`/:env/...`): este panel es el front dedicado de UNA instancia de
// nexolu-comms-api (la de VITE_API_BASE_URL). Operar otro ambiente es
// apuntar otro deploy del panel, no un selector.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      // Paths en espanol (convencion de todo el ecosistema, ver
      // nexolu-pos-front/CLAUDE.md); `name` interno en ingles.
      path: '/iniciar-sesion',
      component: () => import('@/layouts/AuthLayout.vue'),
      children: [
        {
          path: '',
          name: 'login',
          component: () => import('@/modules/auth/views/LoginView.vue'),
        },
      ],
    },
    {
      /*
       * La bandeja embebida en el panel de otra app (hoy, el Spa).
       *
       * Fuera del layout y SIN `requiresAuth` a propósito: quien entra no
       * tiene sesión de Connect ni tiene por qué -- su cuenta está en el
       * Spa, que le pide un token a Connect y nos lo pasa por la URL. Y
       * sin el menú ni la cabecera del panel, que dentro del Spa serían
       * una segunda navegación encima de la suya.
       */
      path: '/embebido/chat',
      name: 'embedded-chat',
      component: () => import('@/modules/chat/views/EmbeddedChatView.vue'),
    },
    {
      /*
       * La puerta de quien viene de otra app (el menu "WhatsApp" del Spa).
       * El pase viaja en el fragmento (#ticket=...&next=...) y se canjea
       * en el guard de abajo, antes de cualquier rebote al login.
       */
      path: '/entrar',
      name: 'ticket-login',
      component: () => import('@/modules/auth/views/TicketLoginView.vue'),
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/modules/dashboard/views/DashboardView.vue'),
        },
        {
          path: 'apps',
          component: () => import('@/modules/commsCore/views/CommsCoreView.vue'),
          children: [
            {
              path: '',
              name: 'comms-core.apps',
              component: () => import('@/modules/commsCore/views/CommsAppsView.vue'),
            },
            {
              path: 'registros',
              name: 'comms-core.logs',
              component: () => import('@/modules/commsCore/views/CommsLogsView.vue'),
            },
          ],
        },
        {
          path: 'webhooks',
          name: 'webhooks',
          component: () => import('@/modules/webhooks/views/WebhookEventsView.vue'),
        },
        {
          path: 'canales',
          name: 'channels',
          component: () => import('@/modules/channels/views/BusinessChannelsView.vue'),
        },
        {
          path: 'plantillas',
          name: 'templates',
          component: () => import('@/modules/templates/views/TemplatesView.vue'),
        },
        {
          // WhatsApp Flows de Meta ("Formularios" en el panel): no son los
          // `flows` de abajo (motor de conversaciones de Connect).
          path: 'formularios',
          name: 'whatsapp-flows',
          component: () => import('@/modules/whatsappFlows/views/WhatsAppFlowsView.vue'),
        },
        {
          path: 'chat',
          name: 'chat',
          component: () => import('@/modules/chat/views/ChatView.vue'),
        },
        {
          path: 'difusiones',
          name: 'broadcasts',
          component: () => import('@/modules/broadcasts/views/BroadcastsView.vue'),
        },
        {
          path: 'flujos',
          name: 'flows',
          component: () => import('@/modules/flows/views/FlowsView.vue'),
        },
        {
          path: 'contactos',
          name: 'contacts',
          component: () => import('@/modules/flows/views/ContactsView.vue'),
        },
        {
          path: 'catalogo',
          name: 'catalog',
          component: () => import('@/modules/catalog/views/CatalogView.vue'),
        },
        {
          // Solo plataforma: el guard de abajo lo rebota al dashboard si un
          // cliente lo escribe a mano (el backend igual respondera 401 -
          // esto es UX, la seguridad vive en el servidor).
          path: 'usuarios',
          name: 'users',
          component: () => import('@/modules/users/views/PanelUsersView.vue'),
          meta: { requiresPlatform: true },
        },
      ],
    },
    {
      // El constructor de flujos vive FUERA del AppLayout: es un editor a
      // pantalla completa (patron ManyChat - el canvas se queda con todo
      // el espacio; nada de sidebar ni navbar).
      path: '/flujos/constructor',
      name: 'flows.builder-new',
      component: () => import('@/modules/flows/builder/FlowBuilderView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/flujos/:flowId/constructor',
      name: 'flows.builder',
      component: () => import('@/modules/flows/builder/FlowBuilderView.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
  ],
})

router.beforeEach(async (to) => {
  /*
   * La bandeja embebida no pasa por nada de esto. Su credencial viene en
   * la URL y su sesión es la del panel que la embebe: rehidratar acá
   * una sesión de Connect que hubiera en este navegador le daría al
   * iframe permisos que no le tocan -- y son el mismo origen.
   */
  if (to.name === 'embedded-chat') return true

  const auth = useAuthStore()

  if (to.name === 'ticket-login') {
    const params = new URLSearchParams(to.hash.replace(/^#/, ''))
    const ticket = params.get('ticket')
    const next = params.get('next') ?? '/chat'
    if (!ticket) {
      if (ticketError.value) return true
      return auth.isAuthenticated ? { name: 'chat' } : { name: 'login' }
    }
    try {
      await auth.exchangeTicket(ticket)
      // Solo rutas locales: el destino lo manda el servidor, pero no cuesta
      // nada no confiar.
      return next.startsWith('/') && !next.startsWith('//') ? next : { name: 'chat' }
    } catch (error) {
      // Pase usado o vencido (recargar la pestana lo reusa): si ya hay
      // sesion, al chat; si no, se muestra el mensaje en la vista.
      if (auth.isAuthenticated) return { name: 'chat' }
      ticketError.value =
        isAxiosError<{ detail?: string }>(error) && error.response?.data?.detail
          ? error.response.data.detail
          : 'No pudimos abrir el chat. Vuelve a entrar desde tu app.'
      return { name: 'ticket-login', hash: '' }
    }
  }

  // Al volver de nexolu-auth hay una asercion esperando (la recogio
  // main.ts del fragmento). Canjearla aca, antes de cualquier rebote a
  // /iniciar-sesion que la descartaria. Mismo flujo que nexolu-admin-front.
  const assertion = ssoAssertion.take()
  if (assertion) {
    try {
      await auth.exchangeAssertion(assertion)
      const pendingRoute = ssoAssertion.takePendingRoute()
      return pendingRoute && pendingRoute !== to.fullPath ? pendingRoute : { name: 'dashboard' }
    } catch (error) {
      // NO rebotar a nexolu-auth: su cookie viva emitiria otra asercion que
      // fallaria igual - bucle infinito sin formulario. Se cae al login
      // local, que ademas es el break-glass.
      auth.clearSession()
      ssoError.value =
        isAxiosError<{ detail?: string }>(error) && error.response?.status === 403
          ? (error.response.data?.detail ?? 'Esa identidad no puede entrar a este panel.')
          : 'No pudimos validar tu acceso con Nexolú. Intenta de nuevo.'
      return to.name === 'login' ? undefined : { name: 'login' }
    }
  }

  // El token sobrevive un F5 (localStorage) pero el store de Pinia no:
  // rehidratar antes de evaluar guards que dependen de auth.user.
  if (auth.isAuthenticated && !auth.user) {
    try {
      await auth.fetchCurrentUser()
    } catch {
      auth.clearSession()
    }
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresPlatform && !auth.isPlatform) {
    return { name: 'dashboard' }
  }

  // Quien ve un solo negocio vino a contestar mensajes: todo lo demas es
  // de la app entera (y el backend igual le responde 404).
  if (auth.isChatOnly && to.meta.requiresAuth && to.name !== 'chat') {
    return { name: 'chat' }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return auth.isChatOnly ? { name: 'chat' } : { name: 'dashboard' }
  }

  return true
})

export default router

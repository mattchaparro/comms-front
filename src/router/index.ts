import { isAxiosError } from 'axios'
import { createRouter, createWebHistory } from 'vue-router'

import { ssoAssertion, ssoError } from '@/services/http/ssoAssertion'
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
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

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

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  return true
})

export default router

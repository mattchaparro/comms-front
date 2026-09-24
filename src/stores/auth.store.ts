import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { rememberCameFromApp } from '@/services/http/cameFromApp'
import { httpClient } from '@/services/http/client'
import { unsubscribeFromPush } from '@/services/push/pushService'
import { tokenStorage } from '@/services/http/tokenStorage'
import { queryClient } from '@/services/query/queryClient'
import type { AuthResponse, LoginCredentials, User } from '@/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(tokenStorage.get())

  const isAuthenticated = computed(() => Boolean(token.value))

  function setSession(data: AuthResponse): void {
    queryClient.clear()
    token.value = data.token
    user.value = data.user
    tokenStorage.set(data.token)
  }

  function clearSession(): void {
    queryClient.clear()
    token.value = null
    user.value = null
    tokenStorage.clear()
  }

  async function login(credentials: LoginCredentials): Promise<void> {
    // Valida contra PANEL_EMAIL/PANEL_PASSWORD_HASH del .env de
    // nexolu-comms-api, sin depender de ningun otro servicio - mismo
    // patron de operador unico que nexolu-admin (ver su app/auth/router.py
    // y el porque en nexolu-comms-api/api/panel.py).
    const { data } = await httpClient.post<AuthResponse>('/panel/auth/login', credentials)
    setSession(data)
  }

  /**
   * Canjea una asercion de nexolu-auth por el token propio del panel.
   *
   * El 403 es TERMINAL: esa identidad no es usuaria de este panel y
   * reintentar el SSO devolveria lo mismo - quien llama no debe rebotar a
   * nexolu-auth ante un 403 o el usuario queda en un bucle sin formulario.
   */
  async function exchangeAssertion(assertion: string): Promise<void> {
    const { data } = await httpClient.post<AuthResponse>(
      '/panel/auth/sso/exchange',
      { assertion },
      // Corre dentro del guard del router: el interceptor no puede navegar
      // por su cuenta o abortaria la navegacion en curso.
      { skipAuthRedirect: true },
    )
    setSession(data)
  }

  /**
   * Canjea el pase de un solo uso con que otra app (el Spa) manda a su
   * gente al chat. Igual que la asercion del SSO: corre dentro del guard,
   * sin redireccion automatica ante un 401.
   */
  async function exchangeTicket(ticket: string): Promise<void> {
    const { data } = await httpClient.post<AuthResponse>(
      '/panel/auth/ticket/exchange',
      { ticket },
      { skipAuthRedirect: true },
    )
    setSession(data)
    rememberCameFromApp()
  }

  /** Rehidrata al usuario a partir del token guardado (recarga de pagina). */
  async function fetchCurrentUser(): Promise<User> {
    const { data } = await httpClient.get<User>('/panel/me')
    user.value = data
    return data
  }

  async function logout(): Promise<void> {
    // Primero el celular: en el del mostrador no deben seguir llegando los
    // mensajes de quien ya se fue. Necesita la sesion viva para decirselo
    // al servidor, por eso va antes de cerrarla. Nunca bloquea la salida.
    await unsubscribeFromPush().catch(() => undefined)
    try {
      await httpClient.post('/panel/auth/logout')
    } finally {
      clearSession()
    }
  }

  // La distincion dura del panel: admin de Nexolu (plataforma completa) vs
  // cliente externo (solo sus apps). El backend ya recorta cada respuesta;
  // esto solo decide que UI mostrar.
  const isPlatform = computed(() => user.value?.roles.includes('platform') ?? false)
  // Quien ve UN negocio (la recepcionista que vino del Spa): vino a
  // contestar mensajes, asi que el panel es solo el chat.
  const isChatOnly = computed(
    () => !isPlatform.value && (user.value?.business_ids?.length ?? 0) > 0,
  )

  return {
    user,
    token,
    isAuthenticated,
    isPlatform,
    isChatOnly,
    login,
    exchangeAssertion,
    exchangeTicket,
    logout,
    fetchCurrentUser,
    clearSession,
  }
})

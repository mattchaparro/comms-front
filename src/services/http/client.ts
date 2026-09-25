import axios from 'axios'

import router from '@/router'
import { useAuthStore } from '@/stores/auth.store'
import { useFlashStore } from '@/stores/flash.store'

import { embedToken } from './embedToken'
import { tokenStorage } from './tokenStorage'

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Deja que quien llama maneje el error sin que el interceptor navegue
     * por su cuenta. Lo usa el canje SSO, que corre DENTRO del guard del
     * router: un `router.push` desde el interceptor en medio de una
     * navegacion la aborta, y ademas seria redundante porque el guard ya
     * decide a donde ir.
     */
    skipAuthRedirect?: boolean
  }
}

// Habla exclusivamente con nexolu-comms-api - este panel ES el front
// dedicado de ese servicio. La credencial es el JWT que emite
// POST /panel/auth/login (nunca la NEXOLU_PLATFORM_API_KEY, que es
// server-side y jamas debe viajar a un navegador).
export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    Accept: 'application/json',
  },
})

httpClient.interceptors.request.use((config) => {
  // La bandeja embebida manda el suyo, que vive solo en memoria y ve un
  // solo negocio. Va primero para que una pestaña embebida NUNCA use por
  // accidente la sesión de panel que haya en este navegador: son el mismo
  // origen, y esa sesión puede ser de administrador.
  const token = embedToken.get() ?? tokenStorage.get()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Mismo criterio que nexolu-pos-front: el token es un PAT de Sanctum sin
// refresh (ver nexolu-pos-api config/sanctum.php) - un 401 limpia la sesion
// y vuelve a pedir credenciales en vez de fallar en silencio.
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.config?.skipAuthRedirect) {
      return Promise.reject(error)
    }

    const status = error.response?.status
    const onLogin = router.currentRoute.value.name === 'login'

    // Dentro de un iframe no hay a dónde mandar a nadie a iniciar sesión:
    // la sesión es del panel que nos embebe, y él la renueva. Mandarlo al
    // login pintaría un formulario de Connect dentro del Spa, que es
    // exactamente lo que enseña a la gente a teclear su contraseña en un
    // sitio que no es el que cree.
    if (embedToken.active) {
      if (status === 401) {
        embedToken.clear()
      }
      return Promise.reject(error)
    }

    if (status === 401 && !onLogin) {
      /*
       * Cerrar la sesion ENTERA, no solo el token guardado: el store lo
       * sigue teniendo en memoria, el guard cree que hay sesion y rebota
       * del login de vuelta al panel -- la pantalla se quedaba trabada.
       */
      useAuthStore().clearSession()
      useFlashStore().set('Tu sesión se cerró. Inicia sesión de nuevo.', 'warn')
      void router.push({ name: 'login' })
    } else if (status === 403 && !onLogin) {
      const message = error.response?.data?.detail ?? 'No tienes permiso para esta acción.'
      useFlashStore().set(message, 'error')
    }

    return Promise.reject(error)
  },
)

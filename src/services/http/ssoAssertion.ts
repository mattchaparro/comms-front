import { ref } from 'vue'

// Recoge la asercion que nexolu-auth deja en el fragmento de la URL al
// volver, y guarda la ruta pretendida antes de irse. Puerto de
// nexolu-admin-front/src/services/http/ssoAssertion.ts - mismos porques:
//
// El parametro se llama `auth_token` y NO `token` (colision con el SSO
// legacy del POS). Ver nexolu-auth/nexolu_auth/api/sso.py.
const FRAGMENT_PARAM = 'auth_token'

// El slug con el que este panel se identifica ante nexolu-auth. Tiene que
// coincidir con una clave de AUTH_PRODUCTS_JSON alla y con
// `nexolu_auth_audience` en nexolu-comms-api.
const PRODUCT = 'nexolu-connect'

// sessionStorage y no localStorage: la asercion vive 120 s y se gasta al
// cargar la pagina.
const ASSERTION_KEY = 'nexolu_connect_sso_assertion'
const PENDING_ROUTE_KEY = 'nexolu_connect_sso_pending_route'

function take(key: string): string | null {
  const value = sessionStorage.getItem(key)
  if (value !== null) sessionStorage.removeItem(key)
  return value
}

/**
 * Motivo por el que fallo el ultimo canje, para que LoginView lo muestre.
 * Un `ref` y no sessionStorage: cuando el canje falla ya estabamos
 * navegando HACIA /iniciar-sesion y LoginView no se vuelve a montar.
 */
export const ssoError = ref<string | null>(null)

/**
 * Corre en main.ts ANTES de montar la app: la primera navegacion de
 * vue-router descarta el fragmento, un guard llegaria tarde (verificado
 * en vivo en el ecosistema, 2026-09-07).
 */
export function stashSsoAssertionFromUrl(): void {
  const hash = window.location.hash
  if (!hash.startsWith(`#${FRAGMENT_PARAM}=`)) return

  const assertion = new URLSearchParams(hash.slice(1)).get(FRAGMENT_PARAM)
  if (!assertion) return

  sessionStorage.setItem(ASSERTION_KEY, assertion)

  // Sacar la asercion de la barra de direcciones: ni historial ni copy-paste.
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

export const ssoAssertion = {
  take: (): string | null => take(ASSERTION_KEY),
  takePendingRoute: (): string | null => take(PENDING_ROUTE_KEY),
}

export function ssoIsConfigured(): boolean {
  return Boolean(import.meta.env.VITE_AUTH_BASE_URL)
}

/**
 * Manda el navegador a la pantalla de nexolu-auth. Solo va `product` en el
 * query: el destino de vuelta lo decide nexolu-auth desde su propia config.
 */
export function redirectToSso(pendingRoute?: string): void {
  const base = import.meta.env.VITE_AUTH_BASE_URL

  if (!base) {
    throw new Error('Falta VITE_AUTH_BASE_URL: el acceso con Nexolu no esta configurado.')
  }

  if (pendingRoute) sessionStorage.setItem(PENDING_ROUTE_KEY, pendingRoute)

  window.location.assign(`${base}/login?product=${PRODUCT}`)
}

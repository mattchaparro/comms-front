import { ref } from 'vue'

/**
 * El token de la bandeja embebida, aparte de la sesión del panel.
 *
 * Aparte y NO en localStorage a propósito. La bandeja embebida se sirve
 * desde el mismo origen que el panel, así que compartir la llave sería
 * pisarse: quien tenga el panel abierto en otra pestaña vería su sesión
 * reemplazada por la de un negocio -- o al revés, la pestaña embebida
 * heredaría permisos de administrador. Viviendo solo en memoria, cada
 * iframe tiene el suyo y no toca nada de nadie.
 *
 * Que se pierda al recargar no es un problema: el token viene en la URL
 * del iframe, así que una recarga lo vuelve a traer. Y dura quince
 * minutos, de modo que tampoco tendría sentido guardarlo.
 */
const token = ref<string | null>(null)

export const embedToken = {
  get: (): string | null => token.value,
  set: (value: string): void => {
    token.value = value
  },
  clear: (): void => {
    token.value = null
  },
  /** Si esta pestaña es una bandeja embebida y no el panel. */
  get active(): boolean {
    return token.value !== null
  },
}

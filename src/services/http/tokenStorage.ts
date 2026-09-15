const TOKEN_KEY = 'nexolu_comms_panel_token'

// Unica fuente de verdad del nombre de la llave en localStorage - el auth
// store la escribe, el interceptor de axios solo la lee. Llave distinta a
// las de nexolu-pos-front y nexolu-admin-front para que las SPAs puedan
// correr en el mismo navegador/dominio de dev sin pisarse la sesion.
export const tokenStorage = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
}

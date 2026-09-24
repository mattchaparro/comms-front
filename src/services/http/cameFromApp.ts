/*
 * Este navegador entro alguna vez con el pase de otra app (el Spa). Lo usa
 * el login para decirle a esa persona por donde entrar: aca no tiene
 * contrasena. Solo una marca, sin datos de nadie.
 */
const KEY = 'nexolu_connect_came_from_app'

export function rememberCameFromApp(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Sin almacenamiento el aviso simplemente no aparece.
  }
}

export function readCameFromApp(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

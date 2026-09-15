import { isAxiosError } from 'axios'

/** El BFF (y payments-core detras) devuelven errores como {"detail": "..."} -
 * se usa en cada vista que dispara una mutation y necesita mostrar el
 * mensaje real en vez de un generico "algo salio mal". */
export function extractErrorMessage(error: unknown, fallback: string): string {
  return isAxiosError<{ detail?: string }>(error) && error.response
    ? (error.response.data?.detail ?? fallback)
    : fallback
}

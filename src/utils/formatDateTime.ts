/**
 * Los servicios backend (Python: payments-core, ia-core, comms-api) devuelven
 * timestamps generados con `datetime.utcnow()` - UTC, pero serializados SIN
 * sufijo de zona horaria (ej. "2026-08-27T22:33:12", sin "Z"). `new Date()`
 * interpreta un datetime ISO sin offset como hora LOCAL del navegador, no
 * UTC - sin esto, cualquier fecha se mostraba 5 horas adelantada en Bogota
 * (bug real, encontrado 2026-08-27 en TransactionsPanel).
 */
export function formatDateTime(iso: string): string {
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso)
  const utcIso = hasTimezone ? iso : `${iso}Z`
  return new Date(utcIso).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
}

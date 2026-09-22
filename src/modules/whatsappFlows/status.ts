// Estados de un WhatsApp Flow en Meta, en castellano para el panel. Se
// muestra lo que Meta diga aunque no esté en esta lista (Meta agrega estados).

type Severity = 'success' | 'danger' | 'warn' | 'info' | 'secondary'

const LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  DEPRECATED: 'Deprecado',
  BLOCKED: 'Bloqueado',
  THROTTLED: 'Limitado',
}

const SEVERITIES: Record<string, Severity> = {
  DRAFT: 'info',
  PUBLISHED: 'success',
  DEPRECATED: 'secondary',
  BLOCKED: 'danger',
  THROTTLED: 'warn',
}

export function statusLabel(status: string): string {
  return LABELS[status] ?? status
}

export function statusSeverity(status: string): Severity {
  return SEVERITIES[status] ?? 'secondary'
}

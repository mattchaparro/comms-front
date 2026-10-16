// El mensaje para mandar A MANO a quien una difusión no le llegó.
//
// Cuando Meta rechaza un envío (el número no tiene WhatsApp, lleva días sin
// escribir y Meta frena la entrega...), la persona sigue siendo una clienta:
// se le puede escribir desde otro WhatsApp. Esto arma ese mensaje con el
// texto de la plantilla y un enlace wa.me que lo abre ya escrito.
//
// `firstName` y `renderParam` repiten las reglas de
// nexolu-comms-api/core/broadcasts.py (first_name / render_param): el nombre
// de pila solo si sirve para saludar. Si cambian allá, cambian acá.

const NO_NAME = new Set(['cliente', 'clienta', 'sin', 'na', 'nn', 'hola', 'no', 'test', 'prueba'])

const WORD = '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+'
const FULL_NAME = new RegExp(`^${WORD}(?:[ '\\-]${WORD})*$`)

/** El nombre de pila si sirve para saludar; '' si no ('?', '.', emojis). */
export function firstName(name: string): string {
  const clean = (name || '').trim()
  if (!FULL_NAME.test(clean)) return ''
  const first = clean.split(' ')[0]
  return first.length < 3 || NO_NAME.has(first.toLowerCase()) ? '' : first
}

/** '{nombre}' -> su nombre de pila; '{nombre|hermosa}' -> con respaldo. */
export function renderParam(raw: string, name: string): string {
  const pila = firstName(name)
  return raw
    .replace(/\{nombre(?:\|([^}]*))?\}/g, (_, fallback?: string) => pila || fallback || '')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** El cuerpo de la plantilla con cada {{n}} reemplazado por su variable. */
export function bodyWithParams(components: Record<string, unknown>[], params: string[]): string {
  const body = components.find((c) => String(c.type).toUpperCase() === 'BODY')
  const text = typeof body?.text === 'string' ? body.text : ''
  return text.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? '')
}

/**
 * El texto de una persona: el borrador con su nombre puesto.
 *
 * Solo se cambia el marcador: los saltos de línea del borrador se respetan
 * (no se pasa por `renderParam`, que junta los espacios).
 */
export function messageFor(draft: string, name: string): string {
  const pila = firstName(name)

  return draft
    .replace(/\{nombre(?:\|([^}]*))?\}/g, (_, fallback?: string) => pila || fallback || '')
    // El saludo sin nombre queda "¡Hola !" / "Hola ,": se cierra el hueco.
    .replace(/(Hola)[ \t]+([!,.])/g, '$1$2')
}

/** wa.me solo recibe dígitos con indicativo. */
export function whatsappLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

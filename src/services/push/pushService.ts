/*
 * Avisos al celular (Web Push) cuando alguien escribe al chat.
 *
 * El numero del negocio no tiene app de WhatsApp: el chat de Connect ES su
 * WhatsApp, y sin esto enterarse de un mensaje depende de tener la pestana
 * abierta. El servidor decide a quien le llega cada aviso (solo a quien
 * puede ver esa conversacion); aca solo se pide permiso y se registra este
 * navegador a nombre de quien tiene la sesion.
 *
 * El service worker (/sw.js) se registra en main.ts y solo recibe avisos:
 * no cachea nada, asi que no puede quedarse sirviendo una version vieja.
 */
import { httpClient } from '@/services/http/client'

export type PushState =
  | 'unsupported' // navegador sin push (o iPhone en Safari sin instalar)
  | 'needs-install' // iPhone/iPad: solo funciona desde la pantalla de inicio
  | 'unavailable' // el servidor no tiene llaves VAPID
  | 'denied' // la persona (o el sistema) los bloqueo
  | 'off'
  | 'on'

interface PublicKey {
  enabled: boolean
  public_key: string
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch {
    // Sin service worker el panel funciona igual, solo que sin avisos.
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  const { data } = await httpClient.get<PublicKey>('/v1/push/public-key')
  if (!data.enabled) return 'unavailable'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return (await currentSubscription()) ? 'on' : 'off'
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Pide permiso y registra este navegador. Tiene que venir de un clic. */
export async function subscribeToPush(): Promise<PushState> {
  if (!pushSupported()) return getPushState()

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const { data } = await httpClient.get<PublicKey>('/v1/push/public-key')
  if (!data.enabled) return 'unavailable'

  await registerServiceWorker()
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()

  // Si el servidor cambio de llave, la suscripcion vieja ya no sirve.
  const expected = urlBase64ToUint8Array(data.public_key)
  const current = subscription?.options.applicationServerKey
  if (subscription && current && !sameKey(new Uint8Array(current), expected)) {
    await subscription.unsubscribe()
    subscription = null
  }

  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expected,
  })

  const json = subscription.toJSON()
  await httpClient.put('/v1/push/subscriptions', {
    endpoint: json.endpoint,
    keys: json.keys,
    content_encoding: (PushManager as unknown as { supportedContentEncodings?: string[] })
      .supportedContentEncodings?.includes('aes128gcm')
      ? 'aes128gcm'
      : 'aesgcm',
  })
  return 'on'
}

function sameKey(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/** Deja de avisar a este navegador (boton, o al cerrar sesion). */
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return
  const subscription = await currentSubscription()
  if (!subscription) return
  try {
    await httpClient.delete('/v1/push/subscriptions', { data: { endpoint: subscription.endpoint } })
  } finally {
    await subscription.unsubscribe()
  }
}

export async function sendTestPush(): Promise<number> {
  const { data } = await httpClient.post<{ sent: number }>('/v1/push/test')
  return data.sent
}

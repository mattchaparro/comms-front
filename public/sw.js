/*
 * Service worker de Nexolú Connect: SOLO avisos (Web Push).
 *
 * A propósito no cachea nada. El panel se despliega con releases atómicas
 * y el index.html con no-store; un service worker que cacheara la app
 * podría quedarse sirviendo una versión vieja sin que nadie lo note.
 *
 * El aviso lo arma el servidor (nexolu-comms-api, core/push.py):
 *   { title, body, tag, url, contact_id, app_id, business_id }
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Nexolú Connect'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Tienes un mensaje nuevo',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      // Una notificación por conversación: los mensajes seguidos de la
      // misma persona la reemplazan, pero vuelven a sonar (renotify).
      tag: data.tag || 'connect',
      renotify: Boolean(data.tag),
      data: { url: data.url || '/chat' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/chat', self.location.origin).href

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        // Ya hay un panel abierto: se enfoca y él navega sin recargar
        // (recargar le borraría a quien contesta lo que tenía escrito).
        await open.focus()
        open.postMessage({ type: 'connect:open', url: target })
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

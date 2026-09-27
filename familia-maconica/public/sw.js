// Service worker: somente notificações push.
// Não guarda páginas em cache: os dados do app são sensíveis (LGPD) e o
// aparelho pode ser compartilhado.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (evento) => {
  let dados = { titulo: 'Família Maçônica', corpo: '', url: '/', tag: undefined }
  try { dados = { ...dados, ...evento.data.json() } } catch (_) {}
  evento.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: '/icones/icone-192.png',
      badge: '/icones/icone-192.png',
      tag: dados.tag,
      data: { url: dados.url },
    }),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const url = new URL(evento.notification.data?.url || '/', self.location.origin).href
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin) && 'focus' in j) {
          j.navigate(url)
          return j.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

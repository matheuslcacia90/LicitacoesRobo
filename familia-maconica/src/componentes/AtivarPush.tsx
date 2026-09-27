'use client'
import { useEffect, useState } from 'react'
import { registrarPush, removerPush } from '@/app/(app)/acoes'

function chaveParaBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const bruto = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)))
}

type Estado = 'carregando' | 'sem-suporte' | 'ios-instalar' | 'negado' | 'desligado' | 'ligado'

export function AtivarPush() {
  const [estado, setEstado] = useState<Estado>('carregando')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const instalado = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setEstado(ios && !instalado ? 'ios-instalar' : 'sem-suporte')
      return
    }
    if (Notification.permission === 'denied') { setEstado('negado'); return }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => setEstado(s ? 'ligado' : 'desligado'))
  }, [])

  async function ligar() {
    setMsg(null)
    const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!chave) { setMsg('Notificações push ainda não configuradas no servidor.'); return }
    const permissao = await Notification.requestPermission()
    if (permissao !== 'granted') { setEstado('negado'); return }
    const reg = await navigator.serviceWorker.ready
    const insc = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) })
    const r = await registrarPush(insc.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } })
    setMsg(r.erro ?? r.ok ?? null)
    if (!r.erro) setEstado('ligado')
  }

  async function desligar() {
    const reg = await navigator.serviceWorker.ready
    const insc = await reg.pushManager.getSubscription()
    if (insc) {
      await removerPush(insc.endpoint)
      await insc.unsubscribe()
    }
    setEstado('desligado')
  }

  return (
    <div className="formulario">
      {estado === 'ios-instalar' && (
        <p className="aviso info">
          No iPhone, as notificações só funcionam com o app na tela inicial: toque em{' '}
          <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>, abra o app por lá e
          volte a esta página.
        </p>
      )}
      {estado === 'sem-suporte' && <p className="suave">Este navegador não recebe notificações. Você receberá por e-mail.</p>}
      {estado === 'negado' && (
        <p className="aviso info">As notificações foram bloqueadas nas configurações do navegador. Você receberá por e-mail.</p>
      )}
      {estado === 'desligado' && <button type="button" onClick={ligar}>Ativar notificações neste aparelho</button>}
      {estado === 'ligado' && (
        <div className="linha">
          <span className="etiqueta ok">Ativadas neste aparelho</span>
          <button type="button" className="secundario pequeno" onClick={desligar}>Desativar</button>
        </div>
      )}
      {msg && <p className="suave">{msg}</p>}
    </div>
  )
}

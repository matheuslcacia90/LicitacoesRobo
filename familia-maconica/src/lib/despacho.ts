import 'server-only'
import webpush from 'web-push'
import { clienteServico } from './supabase/servidor'

type Pendente = {
  id: string
  pessoa_id: string
  email: string | null
  titulo: string
  corpo: string
  evento_id: string | null
  usar_push: boolean
  usar_email: boolean
  inscricoes: { endpoint: string; p256dh: string; auth: string }[]
}

export type Resultado = { processadas: number; push: number; email: number; semCanal: number; falhas: number }

function configurarPush() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contato@example.org', pub, priv)
  return true
}

async function enviarEmail(para: string, assunto: string, texto: string, url: string) {
  const chave = process.env.RESEND_API_KEY
  if (!chave) return false
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_REMETENTE,
      to: [para],
      subject: assunto,
      text: `${texto}\n\nAbrir no app: ${url}\n\nPara mudar o que você recebe, acesse Perfil → Notificações.`,
    }),
  })
  return r.ok
}

// Envia as notificações vencidas: push em cada aparelho inscrito e e-mail
// como cópia (ou como canal principal para quem não ativou o push).
export async function despachar(lote = 100): Promise<Resultado> {
  const sb = clienteServico()
  const pushOk = configurarPush()
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const res: Resultado = { processadas: 0, push: 0, email: 0, semCanal: 0, falhas: 0 }

  const { data, error } = await sb.rpc('notificacoes_para_envio', { p_limite: lote })
  if (error) throw error

  for (const n of (data ?? []) as Pendente[]) {
    res.processadas++
    const caminho = n.evento_id ? `/agenda#evento-${n.evento_id}` : '/notificacoes'
    let entregouPush = false
    const erros: string[] = []

    if (pushOk && n.usar_push) {
      for (const i of n.inscricoes) {
        try {
          await webpush.sendNotification(
            { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
            JSON.stringify({ titulo: n.titulo, corpo: n.corpo, url: caminho, tag: n.evento_id ?? n.id }),
            { TTL: 60 * 60 * 24 },
          )
          entregouPush = true
          res.push++
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) await sb.rpc('remover_push_expirada', { p_endpoint: i.endpoint })
          else erros.push(`push ${status ?? 'erro'}`)
        }
      }
    }

    let entregouEmail = false
    if (n.email && (n.usar_email || !entregouPush)) {
      try {
        entregouEmail = await enviarEmail(n.email, n.titulo, n.corpo, site + caminho)
        if (entregouEmail) res.email++
      } catch {
        erros.push('email')
      }
    }

    if (!entregouPush && !entregouEmail) {
      if (erros.length) res.falhas++
      else res.semCanal++
    }
    await sb.rpc('concluir_notificacao', {
      p_id: n.id,
      p_erro: erros.length ? erros.join(', ') : !entregouPush && !entregouEmail ? 'sem canal disponível' : null,
    })
  }
  return res
}

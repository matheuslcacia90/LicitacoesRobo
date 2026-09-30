import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { exigirPerfilAtivo } from '@/lib/sessao'
import { clienteServidor } from '@/lib/supabase/servidor'
import { avaliarDiagnostico, resumo, type DiagnosticoBanco, type StatusItem } from '@/lib/diagnostico'

export const metadata = { title: 'Diagnóstico da instalação' }

const ETIQUETA: Record<StatusItem, { classe: string; texto: string }> = {
  ok: { classe: 'etiqueta ok', texto: 'ok' },
  alerta: { classe: 'etiqueta ouro', texto: 'atenção' },
  erro: { classe: 'etiqueta erro', texto: 'corrigir' },
}

// Configuração pública do Supabase Auth (a mesma que o navegador consulta).
async function cadastroAberto(): Promise<boolean | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return null
    const s = (await r.json()) as { disable_signup?: boolean }
    return typeof s.disable_signup === 'boolean' ? !s.disable_signup : null
  } catch {
    return null
  }
}

// Confere variáveis, Supabase Auth, banco e agendamentos. Mostra só se cada
// variável existe, nunca o valor.
export default async function Diagnostico() {
  const perfil = await exigirPerfilAtivo()
  if (!perfil.admin) redirect('/')
  const sb = await clienteServidor()
  const [{ data }, aberto, h] = await Promise.all([sb.rpc('diagnostico_instalacao'), cadastroAberto(), headers()])
  const env = process.env
  const grupos = avaliarDiagnostico({
    ambiente: {
      serviceRole: !!env.SUPABASE_SERVICE_ROLE_KEY,
      vapidPublica: !!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      vapidPrivada: !!env.VAPID_PRIVATE_KEY,
      cronSecret: !!env.CRON_SECRET,
      resend: !!env.RESEND_API_KEY,
      siteUrl: env.NEXT_PUBLIC_SITE_URL || null,
    },
    host: h.get('x-forwarded-host') ?? h.get('host'),
    cadastroAberto: aberto,
    banco: (data as DiagnosticoBanco | null) ?? null,
  })
  const r = resumo(grupos)

  return (
    <>
      <h1>Diagnóstico da instalação</h1>
      <p className="suave">
        Confere o que o app consegue ver da configuração. Recarregue a página depois de cada correção.
      </p>
      <p className={r.erro ? 'aviso erro' : r.alerta ? 'aviso info' : 'aviso ok'}>
        {r.erro ? `${r.erro} item(ns) para corrigir` : 'Nada para corrigir'}
        {r.alerta > 0 && ` · ${r.alerta} para conferir`} · {r.ok} ok
      </p>
      {grupos.map((g) => (
        <section key={g.titulo}>
          <h2>{g.titulo}</h2>
          <div className="tabela"><table><tbody>
            {g.itens.map((i) => (
              <tr key={i.titulo}>
                <th scope="row">{i.titulo}</th>
                <td>
                  {i.detalhe}
                  {i.correcao && i.status !== 'ok' && <><br /><span className="suave">{i.correcao}</span></>}
                </td>
                <td><span className={ETIQUETA[i.status].classe}>{ETIQUETA[i.status].texto}</span></td>
              </tr>
            ))}
          </tbody></table></div>
        </section>
      ))}
      <p><a href="/admin">Voltar para a administração</a></p>
    </>
  )
}

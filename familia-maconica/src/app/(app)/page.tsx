import Link from 'next/link'
import { CartaoEvento } from '@/componentes/CartaoEvento'
import { exigirPerfilAtivo } from '@/lib/sessao'
import { clienteServidor } from '@/lib/supabase/servidor'
import { dataCurta, hora } from '@/lib/regras'
import type { EventoAgenda } from '@/lib/tipos'

export default async function Inicio() {
  const perfil = await exigirPerfilAtivo()
  const sb = await clienteServidor()
  const agora = new Date()
  const ate = new Date(agora.getTime() + 14 * 86400_000)
  const { data: eventos } = await sb.rpc('agenda', { p_de: agora.toISOString(), p_ate: ate.toISOString() })

  const orgsSecretaria = perfil.vinculos.filter((v) => v.secretaria).map((v) => v.organizacao_id)
  const { data: convites } = orgsSecretaria.length
    ? await sb
        .from('evento_organizacao')
        .select('organizacao_id, evento:evento_id(id, titulo, inicio, cancelado_em, organizacao:organizacao_id(nome))')
        .eq('status', 'convidada')
        .in('organizacao_id', orgsSecretaria)
    : { data: [] }
  type Convite = {
    organizacao_id: string
    evento: { id: string; titulo: string; inicio: string; cancelado_em: string | null; organizacao: { nome: string } }
  }
  const pendentes = ((convites ?? []) as unknown as Convite[]).filter((c) => c.evento && !c.evento.cancelado_em)
  const aguardando = perfil.dependentes.filter((d) => d.faixa !== 'adulto' && !d.conta_aprovada_em)

  return (
    <>
      <h1>Olá, {perfil.pessoa.nome.split(' ')[0]}</h1>

      {aguardando.length > 0 && (
        <p className="aviso info">
          {aguardando.map((d) => d.nome.split(' ')[0]).join(', ')} aguarda sua aprovação para usar o app.{' '}
          <Link href="/perfil#dependentes">Revisar e aprovar</Link>
        </p>
      )}

      {pendentes.length > 0 && (
        <section>
          <h2>Convites para sua organização</h2>
          {pendentes.map((c) => (
            <div className="cartao" key={c.evento.id + c.organizacao_id}>
              <strong>{c.evento.titulo}</strong>
              <p className="suave" style={{ margin: '4px 0' }}>
                De {c.evento.organizacao.nome} · {dataCurta(c.evento.inicio)} às {hora(c.evento.inicio)}
              </p>
              <Link className="botao pequeno" href={`/secretaria/${c.organizacao_id}/agenda`}>Responder</Link>
            </div>
          ))}
        </section>
      )}

      <h2>Próximos 14 dias</h2>
      {(eventos as EventoAgenda[] | null)?.length ? (
        (eventos as EventoAgenda[]).map((e) => <CartaoEvento key={e.id} e={e} />)
      ) : (
        <p className="suave">Nada marcado. <Link href="/agenda">Ver agenda completa</Link></p>
      )}
    </>
  )
}

import Link from 'next/link'
import { Formulario } from '@/componentes/Formulario'
import { clienteServidor } from '@/lib/supabase/servidor'
import { NOME_TIPO_EVENTO, dataCurta, hora } from '@/lib/regras'
import type { Membro } from '@/lib/tipos'
import { criarEvento, responderParticipacao } from '../acoes'

export const metadata = { title: 'Agenda da organização' }

type Org = { id: string; nome: string; nucleo_id: string; local_padrao_id: string | null }
type Local = { id: string; nome: string }
type Ocupacao = { evento_id: string; inicio: string; fim: string; organizacao: string; titulo: string | null }
type Convite = { evento: { id: string; titulo: string; inicio: string; fim: string; descricao: string | null; cancelado_em: string | null; organizacao: { nome: string } } }
type Criado = { id: string; tipo: keyof typeof NOME_TIPO_EVENTO; titulo: string; inicio: string; fim: string; cancelado_em: string | null; serie_id: string | null; participantes: { status: string; organizacao: { nome: string } }[] }

export default async function AgendaSecretaria({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const sb = await clienteServidor()
  const agora = new Date()
  const em60 = new Date(agora.getTime() + 60 * 86400_000).toISOString()

  const { data: orgData } = await sb.from('organizacao').select('id, nome, nucleo_id, local_padrao_id').eq('id', org).single()
  const esta = orgData as Org
  const [{ data: outras }, { data: locais }, { data: membros }, { data: convites }, { data: criados }] = await Promise.all([
    sb.from('organizacao').select('id, nome').eq('nucleo_id', esta.nucleo_id).neq('id', org).order('nome'),
    sb.from('local').select('id, nome').eq('nucleo_id', esta.nucleo_id).order('nome'),
    sb.rpc('membros_da_organizacao', { p_org: org }),
    sb.from('evento_organizacao')
      .select('evento:evento_id(id, titulo, inicio, fim, descricao, cancelado_em, organizacao:organizacao_id(nome))')
      .eq('organizacao_id', org).eq('status', 'convidada'),
    sb.from('evento')
      .select('id, tipo, titulo, inicio, fim, cancelado_em, serie_id, participantes:evento_organizacao(status, organizacao:organizacao_id(nome))')
      .eq('organizacao_id', org).gte('fim', agora.toISOString()).lte('inicio', em60).order('inicio'),
  ])
  const localPadrao = esta.local_padrao_id ?? (locais as Local[] | null)?.[0]?.id
  const { data: ocupacao } = localPadrao
    ? await sb.rpc('ocupacao_local', { p_local: localPadrao, p_de: agora.toISOString(), p_ate: new Date(agora.getTime() + 30 * 86400_000).toISOString() })
    : { data: [] }
  const ativos = ((membros ?? []) as Membro[]).filter((m) => m.ativo)
  const pendentes = ((convites ?? []) as unknown as Convite[]).filter((c) => c.evento && !c.evento.cancelado_em)

  return (
    <>
      {pendentes.length > 0 && (
        <section>
          <h2>Convites recebidos</h2>
          {pendentes.map(({ evento: e }) => (
            <div key={e.id} className="cartao">
              <strong>{e.titulo}</strong>
              <p className="suave" style={{ margin: '4px 0' }}>
                De {e.organizacao.nome} · {dataCurta(e.inicio)} {hora(e.inicio)}–{hora(e.fim)}
              </p>
              {e.descricao && <p>{e.descricao}</p>}
              <p className="suave">Ao aceitar, os membros desta organização serão notificados.</p>
              <div className="linha">
                <Formulario acao={responderParticipacao.bind(null, org)} rotulo="Aceitar" className="formulario inline">
                  <input type="hidden" name="evento" value={e.id} /><input type="hidden" name="decisao" value="aceitar" />
                </Formulario>
                <Formulario acao={responderParticipacao.bind(null, org)} rotulo="Recusar" perigo className="formulario inline">
                  <input type="hidden" name="evento" value={e.id} /><input type="hidden" name="decisao" value="recusar" />
                </Formulario>
              </div>
            </div>
          ))}
        </section>
      )}

      <details className="cartao" open={pendentes.length === 0}>
        <summary>Novo evento</summary>
        <Formulario acao={criarEvento.bind(null, org)} rotulo="Criar e avisar">
          <div className="grade-2">
            <label>Tipo
              <select name="tipo" defaultValue="reuniao">
                {Object.entries(NOME_TIPO_EVENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </label>
            <label>Título<input name="titulo" required placeholder="ex.: Reunião ordinária" /></label>
            <label>Data<input name="data" type="date" required /></label>
            <label>Local
              <select name="local" defaultValue={localPadrao ?? ''}>
                <option value="">Sem local (não verifica conflito)</option>
                {((locais ?? []) as Local[]).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </label>
            <label>Início<input name="hora_inicio" type="time" required defaultValue="19:30" /></label>
            <label>Término<input name="hora_fim" type="time" required defaultValue="21:30" /></label>
            <label>Repetir semanalmente por
              <select name="repetir" defaultValue="0">
                <option value="0">Não repetir</option>
                {[3, 7, 11, 25, 51].map((n) => <option key={n} value={n}>mais {n} semanas</option>)}
              </select>
            </label>
          </div>
          <label>Descrição (sem conteúdo ritualístico)<textarea name="descricao" /></label>
          <label className="caixa"><input type="checkbox" name="publico" /> Evento público (filantropia, cerimônia aberta) — gera link sem login</label>

          <fieldset>
            <legend>Atividade conjunta ou convite: organizações convidadas</legend>
            {((outras ?? []) as { id: string; nome: string }[]).map((o) => (
              <label key={o.id} className="caixa"><input type="checkbox" name="orgs" value={o.id} /> {o.nome}</label>
            ))}
            <p className="suave" style={{ margin: 0 }}>Cada Secretaria convidada aceita antes que seus membros sejam avisados.</p>
          </fieldset>

          <details>
            <summary>Destinatários específicos (atividade individual, convocação de cargos)</summary>
            <p className="suave">Se marcar alguém, só essas pessoas recebem o evento.</p>
            {ativos.map((m) => (
              <label key={m.pessoa_id} className="caixa"><input type="checkbox" name="pessoas" value={m.pessoa_id} /> {m.nome}{m.cargos.length > 0 && <span className="suave"> · {m.cargos.join(', ')}</span>}</label>
            ))}
          </details>
        </Formulario>
      </details>

      <h2>Ocupação do templo — próximos 30 dias</h2>
      {((ocupacao ?? []) as Ocupacao[]).length === 0 ? <p className="suave">Livre.</p> : (
        <div className="tabela"><table><tbody>
          {((ocupacao ?? []) as Ocupacao[]).map((o) => (
            <tr key={o.evento_id}>
              <td>{dataCurta(o.inicio)}</td><td>{hora(o.inicio)}–{hora(o.fim)}</td>
              <td>{o.organizacao}{o.titulo && <span className="suave"> · {o.titulo}</span>}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}

      <h2>Eventos desta organização — próximos 60 dias</h2>
      {((criados ?? []) as unknown as Criado[]).map((e) => (
        <div key={e.id} className={e.cancelado_em ? 'cartao cancelado' : 'cartao'}>
          <div className="linha entre">
            <Link className="titulo" href={`/secretaria/${org}/agenda/${e.id}`}><strong>{e.titulo}</strong></Link>
            <span className="linha">
              <span className="etiqueta">{NOME_TIPO_EVENTO[e.tipo]}</span>
              {e.serie_id && <span className="etiqueta">série</span>}
              {e.cancelado_em && <span className="etiqueta erro">cancelado</span>}
            </span>
          </div>
          <p className="suave" style={{ margin: '4px 0' }}>{dataCurta(e.inicio)} · {hora(e.inicio)}–{hora(e.fim)}</p>
          {e.participantes.length > 1 && (
            <p className="suave" style={{ margin: 0 }}>
              {e.participantes.map((p) => `${p.organizacao.nome}: ${p.status}`).join(' · ')}
            </p>
          )}
        </div>
      ))}
    </>
  )
}

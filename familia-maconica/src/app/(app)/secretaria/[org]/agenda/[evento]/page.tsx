import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Formulario } from '@/componentes/Formulario'
import { clienteServidor } from '@/lib/supabase/servidor'
import { FUSO, NOME_RESPOSTA, NOME_TIPO_EVENTO, dataCurta, hora } from '@/lib/regras'
import type { TipoResposta } from '@/lib/tipos'
import { cancelarEvento, reagendarEvento } from '../../acoes'

export const metadata = { title: 'Evento' }

type Presenca = { pessoa_id: string; nome: string; organizacao: string; resposta: TipoResposta | null }

const soData = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
const soHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export default async function EventoSecretaria({ params }: { params: Promise<{ org: string; evento: string }> }) {
  const { org, evento } = await params
  const sb = await clienteServidor()
  const { data: e } = await sb
    .from('evento')
    .select('id, organizacao_id, tipo, titulo, descricao, inicio, fim, local_id, publico, serie_id, cancelado_em, participantes:evento_organizacao(status, organizacao:organizacao_id(nome))')
    .eq('id', evento).maybeSingle()
  if (!e) notFound()
  const criadora = e.organizacao_id === org
  const { data: pres } = await sb.rpc('presencas_do_evento', { p_evento: evento })
  const presencas = (pres ?? []) as Presenca[]
  const contagem = presencas.reduce<Record<string, number>>((acc, p) => {
    const k = p.resposta ?? 'sem resposta'
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})
  const { data: locais } = await sb.from('local').select('id, nome').order('nome')
  const participantes = e.participantes as unknown as { status: string; organizacao: { nome: string } }[]

  return (
    <>
      <p><Link href={`/secretaria/${org}/agenda`}>← Agenda</Link></p>
      <h2>{e.titulo} {e.cancelado_em && <span className="etiqueta erro">cancelado</span>}</h2>
      <p className="suave">
        {NOME_TIPO_EVENTO[e.tipo as keyof typeof NOME_TIPO_EVENTO]} · {dataCurta(e.inicio)} {hora(e.inicio)}–{hora(e.fim)}
        {e.publico && <> · <Link href={`/e/${e.id}`}>link público</Link></>}
      </p>
      {e.descricao && <p>{e.descricao}</p>}
      {participantes.length > 1 && (
        <p className="suave">{participantes.map((p) => `${p.organizacao.nome}: ${p.status}`).join(' · ')}</p>
      )}

      <h3>Presenças dos seus membros</h3>
      <p className="suave">
        {Object.entries(contagem).map(([k, v]) => `${k in NOME_RESPOSTA ? NOME_RESPOSTA[k as TipoResposta] : k}: ${v}`).join(' · ') || 'Nenhum destinatário.'}
      </p>
      <div className="tabela"><table><tbody>
        {presencas.map((p) => (
          <tr key={p.pessoa_id}><td>{p.nome}</td><td>{p.resposta ? NOME_RESPOSTA[p.resposta] : <span className="suave">—</span>}</td></tr>
        ))}
      </tbody></table></div>

      {criadora && !e.cancelado_em && (
        <>
          <h3>Alterar horário</h3>
          <Formulario acao={reagendarEvento.bind(null, org)} rotulo="Salvar e avisar">
            <input type="hidden" name="evento" value={e.id} />
            <div className="grade-2">
              <label>Data<input name="data" type="date" defaultValue={soData.format(new Date(e.inicio))} required /></label>
              <label>Local
                <select name="local" defaultValue={e.local_id ?? ''}>
                  <option value="">Sem local</option>
                  {((locais ?? []) as { id: string; nome: string }[]).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </label>
              <label>Início<input name="hora_inicio" type="time" defaultValue={soHora.format(new Date(e.inicio))} required /></label>
              <label>Término<input name="hora_fim" type="time" defaultValue={soHora.format(new Date(e.fim))} required /></label>
            </div>
          </Formulario>

          <h3>Cancelar</h3>
          <Formulario acao={cancelarEvento.bind(null, org)} rotulo="Cancelar evento" perigo
                      confirmar="Cancelar e avisar todos os participantes?">
            <input type="hidden" name="evento" value={e.id} />
            {e.serie_id && <label className="caixa"><input type="checkbox" name="serie" /> Cancelar também as próximas datas da série</label>}
          </Formulario>
        </>
      )}
    </>
  )
}

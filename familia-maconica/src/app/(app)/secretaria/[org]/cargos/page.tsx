import Link from 'next/link'
import { Formulario } from '@/componentes/Formulario'
import { clienteServidor } from '@/lib/supabase/servidor'
import type { LinhaQuadro, Membro } from '@/lib/tipos'
import { atribuir, criarCargo, criarMandato, efetivar, transferir } from '../acoes'

export const metadata = { title: 'Cargos e gestões' }

type Mandato = { id: string; nome: string; inicio: string; fim: string }

export default async function CargosSecretaria({ params, searchParams }: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ mandato?: string }>
}) {
  const { org } = await params
  const { mandato: mandatoParam } = await searchParams
  const sb = await clienteServidor()
  const hoje = new Date().toISOString().slice(0, 10)

  const { data: mand } = await sb.from('mandato').select('id, nome, inicio, fim').eq('organizacao_id', org).order('inicio', { ascending: false })
  const mandatos = (mand ?? []) as Mandato[]
  const vigente = mandatos.find((m) => m.inicio <= hoje && m.fim >= hoje)
  const selecionado = mandatos.find((m) => m.id === mandatoParam) ?? vigente ?? mandatos[0]
  const historico = selecionado && selecionado.fim < hoje

  const [{ data: quadro }, { data: membrosData }] = await Promise.all([
    selecionado
      ? sb.rpc('quadro_cargos', { p_org: org, p_mandato: selecionado.id })
      : Promise.resolve({ data: [] }),
    sb.rpc('membros_da_organizacao', { p_org: org }),
  ])
  const linhas = (quadro ?? []) as LinhaQuadro[]
  const ativos = ((membrosData ?? []) as Membro[]).filter((m) => m.ativo)
  const opcoes = (adulto: boolean) =>
    ativos.filter((m) => !adulto || m.faixa === 'adulto').map((m) => <option key={m.pessoa_id} value={m.pessoa_id}>{m.nome}</option>)

  // Agrupa ocupações por cargo (cargos com várias vagas).
  const porCargo = new Map<string, LinhaQuadro[]>()
  for (const l of linhas) porCargo.set(l.cargo_id, [...(porCargo.get(l.cargo_id) ?? []), l])

  return (
    <>
      <nav className="navegacao-secundaria">
        {mandatos.map((m) => (
          <Link key={m.id} href={`?mandato=${m.id}`} aria-current={m.id === selecionado?.id ? 'page' : undefined}>
            {m.nome}{m.id === vigente?.id ? ' (vigente)' : ''}
          </Link>
        ))}
      </nav>

      {!selecionado && <p className="aviso info">Cadastre a gestão atual para montar o quadro de cargos.</p>}

      {selecionado && (
        <>
          <p className="suave">{selecionado.inicio} a {selecionado.fim}{historico && ' · gestão encerrada (histórico)'}</p>
          {[...porCargo.values()].map((ocup) => {
            const c = ocup[0]
            const ocupadas = ocup.filter((o) => o.ocupacao_id && !o.fim)
            return (
              <div key={c.cargo_id} className="cartao">
                <div className="linha entre">
                  <strong>{c.cargo}</strong>
                  {c.para_adulto && <span className="etiqueta">adulto</span>}
                </div>
                {ocup.filter((o) => o.ocupacao_id).map((o) => (
                  <div key={o.ocupacao_id} style={{ marginTop: 6 }}>
                    <span style={o.fim ? { textDecoration: 'line-through' } : undefined}>{o.pessoa}</span>{' '}
                    <span className="suave">desde {o.inicio}{o.fim && ` até ${o.fim}`}</span>
                    {o.interino && !o.fim && <> <span className="etiqueta ouro">interino</span></>}
                    {!historico && !o.fim && (
                      <details>
                        <summary className="suave">Transferir{o.interino ? ' / efetivar' : ''}</summary>
                        {o.interino && (
                          <Formulario acao={efetivar.bind(null, org)} rotulo="Tornar definitivo" className="formulario inline">
                            <input type="hidden" name="ocupacao" value={o.ocupacao_id!} />
                          </Formulario>
                        )}
                        <Formulario acao={transferir.bind(null, org)} rotulo="Transferir">
                          <input type="hidden" name="ocupacao" value={o.ocupacao_id!} />
                          <input type="hidden" name="pessoa" value={o.pessoa_id!} />
                          <div className="grade-2">
                            <label>Sucessor<select name="sucessor" required defaultValue=""><option value="" disabled>Escolha…</option>{opcoes(c.para_adulto)}</select></label>
                            <label>A partir de<input name="inicio" type="date" defaultValue={hoje} required /></label>
                          </div>
                          <label className="caixa"><input type="checkbox" name="interino" /> Interino</label>
                        </Formulario>
                      </details>
                    )}
                  </div>
                ))}
                {!historico && ocupadas.length === 0 && (
                  <Formulario acao={atribuir.bind(null, org)} rotulo="Atribuir" className="formulario inline">
                    <input type="hidden" name="mandato" value={selecionado.id} />
                    <input type="hidden" name="cargo" value={c.cargo_id} />
                    <label>Ocupante<select name="pessoa" required defaultValue=""><option value="" disabled>Vago — escolha…</option>{opcoes(c.para_adulto)}</select></label>
                    <label className="caixa"><input type="checkbox" name="interino" /> Interino</label>
                  </Formulario>
                )}
                {!historico && ocupadas.length > 0 && (
                  <details>
                    <summary className="suave">Adicionar ocupante (cargos com mais de uma vaga)</summary>
                    <Formulario acao={atribuir.bind(null, org)} rotulo="Adicionar" className="formulario inline">
                      <input type="hidden" name="mandato" value={selecionado.id} />
                      <input type="hidden" name="cargo" value={c.cargo_id} />
                      <label>Ocupante<select name="pessoa" required defaultValue=""><option value="" disabled>Escolha…</option>{opcoes(c.para_adulto)}</select></label>
                    </Formulario>
                  </details>
                )}
              </div>
            )
          })}
        </>
      )}

      <h2>Nova gestão</h2>
      <Formulario acao={criarMandato.bind(null, org)} rotulo="Criar gestão" limparAoConcluir>
        <div className="grade-2">
          <label>Nome<input name="nome" placeholder="Gestão 2027/1" required /></label>
          <span />
          <label>Início<input name="inicio" type="date" required /></label>
          <label>Fim<input name="fim" type="date" required /></label>
        </div>
      </Formulario>

      <details style={{ marginTop: 16 }}>
        <summary>Cargo próprio desta organização</summary>
        <p className="suave">O catálogo padrão vem por tipo de organização; acrescente cargos específicos aqui.</p>
        <Formulario acao={criarCargo.bind(null, org)} rotulo="Criar cargo" limparAoConcluir>
          <div className="grade-2">
            <label>Nome<input name="nome" required /></label>
            <label>Ordem no quadro<input name="ordem" type="number" defaultValue={500} /></label>
            <label>Vagas<input name="vagas" type="number" min={1} defaultValue={1} /></label>
          </div>
          <label className="caixa"><input type="checkbox" name="para_adulto" /> Exclusivo de adultos</label>
        </Formulario>
      </details>
    </>
  )
}

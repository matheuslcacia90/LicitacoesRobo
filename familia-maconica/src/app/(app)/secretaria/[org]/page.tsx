import Link from 'next/link'
import { Formulario } from '@/componentes/Formulario'
import { clienteServidor } from '@/lib/supabase/servidor'
import { NOME_FAIXA } from '@/lib/regras'
import type { Membro } from '@/lib/tipos'
import { cadastrar, reativar, reenviarConvite } from './acoes'

export const metadata = { title: 'Membros' }

function Situacao({ m }: { m: Membro }) {
  if (!m.ativo) return <span className="etiqueta erro">inativo</span>
  if (m.faixa !== 'adulto' && !m.conta_aprovada) return <span className="etiqueta ouro">aguarda responsável</span>
  if (m.email && !m.primeiro_acesso_feito) return <span className="etiqueta ouro">convite pendente</span>
  if (!m.email) return <span className="etiqueta">sem login</span>
  return <span className="etiqueta ok">ativo</span>
}

export default async function Membros({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const sb = await clienteServidor()
  const { data, error } = await sb.rpc('membros_da_organizacao', { p_org: org })
  if (error) throw error
  const membros = data as Membro[]
  const ativos = membros.filter((m) => m.ativo)
  const inativos = membros.filter((m) => !m.ativo)

  return (
    <>
      <details className="cartao">
        <summary>Cadastrar membro</summary>
        <p className="suave" style={{ marginTop: 8 }}>
          Muitos membros? <a href={`/secretaria/${org}/importar`}>Importe uma planilha</a>.
        </p>
        <Formulario acao={cadastrar.bind(null, org)} rotulo="Cadastrar e enviar convite" limparAoConcluir>
          <div className="grade-2">
            <label>Nome completo<input name="nome" required /></label>
            <label>Data de nascimento<input name="nascimento" type="date" required /></label>
            <label>E-mail (login)<input name="email" type="email" /></label>
            <label>Celular<input name="celular" type="tel" /></label>
            <label>ID oficial (ID DeMolay, CIM…)<input name="id_oficial" /></label>
            <label>Papel
              <select name="papel" defaultValue="membro">
                <option value="membro">Membro</option>
                <option value="adulto">Adulto (Consultor, Guardião, Maioridade…)</option>
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Responsável legal — obrigatório para menores de 18</legend>
            <div className="grade-2">
              <label>Nome<input name="resp_nome" /></label>
              <label>E-mail<input name="resp_email" type="email" /></label>
              <label>Celular<input name="resp_celular" type="tel" /></label>
              <label>Parentesco<input name="resp_parentesco" placeholder="mãe, pai, tutor…" /></label>
            </div>
          </fieldset>
          <p className="suave">
            Dados mínimos, conforme a LGPD. A pessoa recebe um link para criar a própria senha. Contas de
            menores só são ativadas depois que o responsável aprova no app.
          </p>
        </Formulario>
      </details>

      <h2>Ativos ({ativos.length})</h2>
      <div className="tabela">
        <table>
          <thead><tr><th>Nome</th><th>Situação</th><th>Cargos</th><th></th></tr></thead>
          <tbody>
            {ativos.map((m) => (
              <tr key={m.vinculo_id}>
                <td>
                  {m.nome}{m.secretaria && <> <span className="etiqueta">Secretaria</span></>}
                  <div className="suave">
                    {m.faixa && NOME_FAIXA[m.faixa]}{m.email && <> · {m.email}</>}{m.celular && <> · {m.celular}</>}
                  </div>
                  {m.responsaveis.length > 0 && <div className="suave">Resp.: {m.responsaveis.join('; ')}</div>}
                </td>
                <td><Situacao m={m} /></td>
                <td>{m.cargos.join(', ') || <span className="suave">—</span>}</td>
                <td>
                  {m.email && !m.primeiro_acesso_feito && (
                    <Formulario acao={reenviarConvite.bind(null, org)} rotulo="Reenviar convite" className="formulario inline">
                      <input type="hidden" name="pessoa" value={m.pessoa_id} />
                    </Formulario>
                  )}
                  <Link href={`/secretaria/${org}/membros/${m.pessoa_id}`} className="botao secundario pequeno">Desativar</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inativos.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary>Inativos ({inativos.length})</summary>
          <div className="tabela">
            <table>
              <tbody>
                {inativos.map((m) => (
                  <tr key={m.vinculo_id}>
                    <td>{m.nome}<div className="suave">desde {m.fim}</div></td>
                    <td>
                      <Formulario acao={reativar.bind(null, org)} rotulo="Reativar" className="formulario inline">
                        <input type="hidden" name="pessoa" value={m.pessoa_id} />
                        <input type="hidden" name="papel" value={m.papel} />
                      </Formulario>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  )
}

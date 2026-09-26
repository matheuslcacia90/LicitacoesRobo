import { AtivarPush } from '@/componentes/AtivarPush'
import { Formulario } from '@/componentes/Formulario'
import { exigirPerfilAtivo } from '@/lib/sessao'
import { NOME_FAIXA, NOME_TIPO_EVENTO, podeSilenciar, VERSAO_TERMO } from '@/lib/regras'
import type { TipoEvento } from '@/lib/tipos'
import {
  aprovarMenor, atualizarCelular, autorizarFoto, excluirDependente, excluirMinhaConta, revogarMenor,
  salvarPreferencias,
} from '../acoes'

export const metadata = { title: 'Perfil' }

const TIPOS: TipoEvento[] = ['reuniao', 'conjunta', 'individual', 'convite', 'evento']

export default async function PerfilPagina() {
  const perfil = await exigirPerfilAtivo()
  const { pessoa } = perfil
  const pref = (t: TipoEvento) => perfil.preferencias.find((p) => p.tipo === t) ?? { push: true, email: true }

  return (
    <>
      <h1>{pessoa.nome}</h1>
      <p className="suave" style={{ marginTop: -8 }}>
        {pessoa.email} · {perfil.vinculos.map((v) => v.organizacao + (v.secretaria ? ' (Secretaria)' : '')).join(' · ') || 'Responsável'}
      </p>

      <h2>Contato</h2>
      <Formulario acao={atualizarCelular} rotulo="Salvar celular">
        <label>Celular<input name="celular" type="tel" defaultValue={pessoa.celular ?? ''} autoComplete="tel" /></label>
      </Formulario>
      <p className="suave">Nome, e-mail e data de nascimento são alterados pela Secretaria.</p>

      <h2>Notificações</h2>
      <AtivarPush />
      <details style={{ marginTop: 12 }}>
        <summary>Escolher o que receber</summary>
        <Formulario acao={salvarPreferencias} rotulo="Salvar preferências">
          <div className="tabela">
            <table>
              <thead><tr><th>Tipo</th><th>Celular</th><th>E-mail</th></tr></thead>
              <tbody>
                {TIPOS.map((t) => (
                  <tr key={t}>
                    <td>{NOME_TIPO_EVENTO[t]}{!podeSilenciar(t) && <span className="suave"> (obrigatório)</span>}</td>
                    <td><input type="checkbox" name={`${t}_push`} defaultChecked={pref(t).push} aria-label={`${NOME_TIPO_EVENTO[t]} no celular`} /></td>
                    <td><input type="checkbox" name={`${t}_email`} defaultChecked={pref(t).email} aria-label={`${NOME_TIPO_EVENTO[t]} por e-mail`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="suave">Reuniões e cancelamentos sempre chegam por ao menos um canal.</p>
        </Formulario>
      </details>

      {perfil.dependentes.length > 0 && (
        <section id="dependentes">
          <h2>Dependentes</h2>
          {perfil.dependentes.map((d) => (
            <div key={d.pessoa_id} className="cartao">
              <div className="linha entre">
                <strong>{d.nome}</strong>
                {d.faixa === 'adulto'
                  ? <span className="etiqueta">maior de idade</span>
                  : d.conta_aprovada_em
                    ? <span className="etiqueta ok">conta aprovada</span>
                    : <span className="etiqueta ouro">aguardando sua aprovação</span>}
              </div>
              <p className="suave" style={{ margin: '4px 0' }}>
                {NOME_FAIXA[d.faixa]} · {d.organizacoes.join(' · ') || 'sem vínculo ativo'}
              </p>

              {d.faixa !== 'adulto' && !d.conta_aprovada_em && (
                <Formulario acao={aprovarMenor} rotulo="Aprovar conta">
                  <input type="hidden" name="menor" value={d.pessoa_id} />
                  <details>
                    <summary>Termo de consentimento ({VERSAO_TERMO})</summary>
                    <p className="suave">
                      Autorizo o tratamento dos dados de {d.nome.split(' ')[0]} (nome, data de nascimento, contato e
                      participação nas atividades) pela organização, somente para agenda, cargos e avisos do núcleo.
                      Os dados não são compartilhados com terceiros. Recebo cópia dos avisos enviados a ele(a) e posso
                      revogar este consentimento ou pedir a exclusão a qualquer momento nesta página.
                    </p>
                    <p className="suave"><em>Texto provisório — substituir pela versão revisada por advogado.</em></p>
                  </details>
                  <label className="caixa"><input type="checkbox" name="aceite" required /> Sou o responsável legal, li e aceito o termo.</label>
                </Formulario>
              )}

              {d.faixa !== 'adulto' && d.conta_aprovada_em && (
                <details>
                  <summary>Consentimento e dados</summary>
                  <Formulario acao={autorizarFoto} rotulo="Salvar" className="formulario inline">
                    <input type="hidden" name="menor" value={d.pessoa_id} />
                    <label>Foto no app
                      <select name="autorizada" defaultValue={d.foto_autorizada ? 'sim' : 'nao'}>
                        <option value="nao">Não autorizo</option>
                        <option value="sim">Autorizo</option>
                      </select>
                    </label>
                  </Formulario>
                  <Formulario acao={revogarMenor} rotulo="Revogar consentimento" perigo
                              confirmar="A conta do dependente será suspensa até nova aprovação. Continuar?">
                    <input type="hidden" name="menor" value={d.pessoa_id} />
                  </Formulario>
                  <Formulario acao={excluirDependente} rotulo="Excluir dados do dependente" perigo>
                    <input type="hidden" name="menor" value={d.pessoa_id} />
                    <label>Para excluir definitivamente, digite EXCLUIR<input name="confirmacao" autoComplete="off" /></label>
                  </Formulario>
                </details>
              )}
            </div>
          ))}
        </section>
      )}

      <h2>Segurança e conta</h2>
      <p><a href="/seguranca">Verificação em duas etapas</a></p>
      <form action="/sair" method="post"><button className="secundario">Sair</button></form>
      <details style={{ marginTop: 16 }}>
        <summary>Excluir minha conta</summary>
        <p className="suave">
          Seus dados pessoais serão apagados e o histórico (cargos exercidos, presenças) ficará anônimo.
          Se você ocupa um cargo, a Secretaria precisa transferi-lo antes.
        </p>
        <Formulario acao={excluirMinhaConta} rotulo="Excluir definitivamente" perigo>
          <input type="hidden" name="pessoa" value={pessoa.id} />
          <label>Digite EXCLUIR<input name="confirmacao" autoComplete="off" /></label>
        </Formulario>
      </details>
    </>
  )
}

import { redirect } from 'next/navigation'
import { Formulario } from '@/componentes/Formulario'
import { exigirPerfilAtivo } from '@/lib/sessao'
import { clienteServidor } from '@/lib/supabase/servidor'
import { NOME_TIPO_ORGANIZACAO } from '@/lib/regras'
import { criarLocal, criarNucleo, criarOrganizacao, nomearSecretaria, revogarSecretaria } from './acoes'

export const metadata = { title: 'Administração' }

type Nucleo = { id: string; nome: string; cidade: string | null; uf: string | null }
type Local = { id: string; nucleo_id: string; nome: string }
type Org = { id: string; nucleo_id: string; nome: string; tipo: keyof typeof NOME_TIPO_ORGANIZACAO; numero: string | null }
type Sec = { organizacao_id: string; pessoa_id: string; nome: string; email: string; primeiro_acesso_feito: boolean }

// O administrador cria organizações e nomeia Secretarias. Não vê dados de membros.
export default async function Admin() {
  const perfil = await exigirPerfilAtivo()
  if (!perfil.admin) redirect('/')
  const sb = await clienteServidor()
  const [{ data: n }, { data: l }, { data: o }, { data: s }] = await Promise.all([
    sb.from('nucleo').select('id, nome, cidade, uf').order('nome'),
    sb.from('local').select('id, nucleo_id, nome').order('nome'),
    sb.from('organizacao').select('id, nucleo_id, nome, tipo, numero').order('nome'),
    sb.rpc('listar_secretarias'),
  ])
  const nucleos = (n ?? []) as Nucleo[]
  const locais = (l ?? []) as Local[]
  const orgs = (o ?? []) as Org[]
  const secs = (s ?? []) as Sec[]

  return (
    <>
      <h1>Administração da plataforma</h1>
      {nucleos.map((nu) => (
        <section key={nu.id} className="cartao">
          <h2 style={{ marginTop: 0 }}>{nu.nome} <span className="suave">{[nu.cidade, nu.uf].filter(Boolean).join('/')}</span></h2>
          <p className="suave">Locais: {locais.filter((x) => x.nucleo_id === nu.id).map((x) => x.nome).join(', ') || '—'}</p>
          {orgs.filter((x) => x.nucleo_id === nu.id).map((org) => (
            <div key={org.id} style={{ borderTop: '1px solid var(--linha)', paddingTop: 8, marginTop: 8 }}>
              <strong>{org.nome}</strong> <span className="suave">{NOME_TIPO_ORGANIZACAO[org.tipo]}{org.numero && ` nº ${org.numero}`}</span>
              {secs.filter((x) => x.organizacao_id === org.id).map((sec) => (
                <div key={sec.pessoa_id} className="linha" style={{ marginTop: 4 }}>
                  <span>Secretaria: {sec.nome} <span className="suave">{sec.email}</span></span>
                  {!sec.primeiro_acesso_feito && <span className="etiqueta ouro">convite pendente</span>}
                  <Formulario acao={revogarSecretaria} rotulo="Remover" perigo className="formulario inline"
                              confirmar={`Remover ${sec.nome} da Secretaria de ${org.nome}?`}>
                    <input type="hidden" name="org" value={org.id} /><input type="hidden" name="pessoa" value={sec.pessoa_id} />
                  </Formulario>
                </div>
              ))}
              <details>
                <summary className="suave">Nomear Secretaria</summary>
                <Formulario acao={nomearSecretaria} rotulo="Nomear e convidar" limparAoConcluir>
                  <input type="hidden" name="org" value={org.id} />
                  <div className="grade-2">
                    <label>Nome<input name="nome" required /></label>
                    <label>E-mail<input name="email" type="email" required /></label>
                  </div>
                </Formulario>
              </details>
            </div>
          ))}
          <details style={{ marginTop: 12 }}>
            <summary>Nova organização</summary>
            <Formulario acao={criarOrganizacao} rotulo="Criar organização" limparAoConcluir>
              <input type="hidden" name="nucleo" value={nu.id} />
              <div className="grade-2">
                <label>Tipo
                  <select name="tipo">{Object.entries(NOME_TIPO_ORGANIZACAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
                </label>
                <label>Nome<input name="nome" required /></label>
                <label>Número<input name="numero" /></label>
                <label>Potência / jurisdição<input name="jurisdicao" /></label>
                <label>Local de reunião
                  <select name="local" defaultValue="">
                    <option value="">—</option>
                    {locais.filter((x) => x.nucleo_id === nu.id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select>
                </label>
              </div>
            </Formulario>
          </details>
          <details>
            <summary>Novo local</summary>
            <Formulario acao={criarLocal} rotulo="Criar local" limparAoConcluir>
              <input type="hidden" name="nucleo" value={nu.id} />
              <div className="grade-2">
                <label>Nome<input name="nome" placeholder="Templo, Salão de festas…" required /></label>
                <label>Endereço<input name="endereco" /></label>
              </div>
            </Formulario>
          </details>
        </section>
      ))}
      <h2>Novo núcleo</h2>
      <Formulario acao={criarNucleo} rotulo="Criar núcleo" limparAoConcluir>
        <div className="grade-2">
          <label>Nome<input name="nome" required /></label>
          <label>Cidade<input name="cidade" /></label>
          <label>UF<input name="uf" maxLength={2} /></label>
        </div>
      </Formulario>
    </>
  )
}

import { redirect } from 'next/navigation'
import { exigirPerfilAtivo } from '@/lib/sessao'
import { clienteServidor } from '@/lib/supabase/servidor'
import { NOME_TIPO_ORGANIZACAO } from '@/lib/regras'
import type { LinhaQuadro } from '@/lib/tipos'

export const metadata = { title: 'Cargos' }

type MeuCargo = {
  interino: boolean
  cargo: { nome: string }
  mandato: { nome: string; fim: string; organizacao: { nome: string } }
}

export default async function Cargos() {
  const perfil = await exigirPerfilAtivo()
  if (perfil.pessoa.faixa === 'crianca') redirect('/')
  const sb = await clienteServidor()

  const { data: meus } = await sb
    .from('ocupacao_cargo')
    .select('interino, cargo:cargo_id(nome), mandato:mandato_id(nome, fim, organizacao:organizacao_id(nome))')
    .eq('pessoa_id', perfil.pessoa.id)
    .is('fim', null)
  const hoje = new Date().toISOString().slice(0, 10)
  const vigentes = ((meus ?? []) as unknown as MeuCargo[]).filter((m) => m.mandato.fim >= hoje)

  const quadros = await Promise.all(
    perfil.vinculos.map(async (v) => {
      const { data } = await sb.rpc('quadro_cargos', { p_org: v.organizacao_id })
      return { v, linhas: (data ?? []) as LinhaQuadro[] }
    }),
  )

  return (
    <>
      <h1>Cargos</h1>
      {vigentes.length > 0 && (
        <div className="cartao">
          <strong>Meus cargos</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {vigentes.map((m, i) => (
              <li key={i}>
                {m.cargo.nome} — {m.mandato.organizacao.nome}
                {m.interino && <> <span className="etiqueta ouro">interino</span></>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {quadros.map(({ v, linhas }) => (
        <section key={v.organizacao_id}>
          <h2>{v.organizacao}</h2>
          <p className="suave" style={{ marginTop: -8 }}>
            {NOME_TIPO_ORGANIZACAO[v.tipo]}{linhas[0] ? ` · ${linhas[0].mandato}` : ''}
          </p>
          {linhas.length === 0 ? (
            <p className="suave">Nenhuma gestão cadastrada.</p>
          ) : (
            <div className="tabela">
              <table>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={l.cargo_id + (l.ocupacao_id ?? i)}>
                      <td>{l.cargo}</td>
                      <td>
                        {l.pessoa ?? <span className="suave">—</span>}
                        {l.interino && <> <span className="etiqueta ouro">interino</span></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </>
  )
}

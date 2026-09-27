import { redirect } from 'next/navigation'
import { exigirPerfilAtivo } from '@/lib/sessao'
import { clienteServidor } from '@/lib/supabase/servidor'
import { NOME_TIPO_ORGANIZACAO, avaliarMetricas, type Meta, type StatusMeta } from '@/lib/regras'
import type { MetricasOrganizacao } from '@/lib/tipos'

export const metadata = { title: 'Métricas do piloto' }

const ETIQUETA: Record<StatusMeta, { classe: string; texto: string }> = {
  ok: { classe: 'etiqueta ok', texto: 'na meta' },
  alerta: { classe: 'etiqueta ouro', texto: 'no prazo' },
  erro: { classe: 'etiqueta erro', texto: 'abaixo da meta' },
  'sem-dados': { classe: 'etiqueta', texto: 'sem dados' },
}

function Linha({ titulo, meta }: { titulo: string; meta: Meta }) {
  const e = ETIQUETA[meta.status]
  return (
    <tr>
      <th scope="row">{titulo}</th>
      <td>{meta.valor}<br /><span className="suave">{meta.detalhe}</span></td>
      <td><span className={e.classe}>{e.texto}</span></td>
    </tr>
  )
}

// Números agregados (sem dado pessoal) para decidir, ao fim do piloto,
// se o app segue, muda de escopo ou para (dossiê, seção 10).
export default async function Metricas() {
  const perfil = await exigirPerfilAtivo()
  if (!perfil.admin && !perfil.vinculos.some((v) => v.secretaria)) redirect('/')
  const sb = await clienteServidor()
  const { data } = await sb.rpc('metricas_piloto')
  const linhas = (data ?? []) as MetricasOrganizacao[]

  return (
    <>
      <h1>Métricas do piloto</h1>
      <p className="suave">
        Números de cada organização comparados com as metas do piloto. Nenhum nome aparece aqui.
        O uso semanal conta quem abriu o app nos últimos 7 dias.
      </p>
      {linhas.length === 0 && <p>Nenhuma organização para mostrar.</p>}
      {linhas.map((m) => {
        const r = avaliarMetricas(m)
        return (
          <section key={m.organizacao_id} className="cartao">
            <h2 style={{ marginTop: 0 }}>{m.organizacao} <span className="suave">{NOME_TIPO_ORGANIZACAO[m.tipo]} · {m.nucleo}</span></h2>
            <div className="tabela">
              <table>
                <tbody>
                  <Linha titulo="Agenda" meta={r.agenda} />
                  <Linha titulo="Cargos da gestão" meta={r.cargos} />
                  <Linha titulo="Menores com consentimento" meta={r.menores} />
                  <Linha titulo="Uso semanal (adultos)" meta={r.uso} />
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </>
  )
}

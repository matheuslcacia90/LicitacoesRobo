import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Formulario } from '@/componentes/Formulario'
import { clienteServidor } from '@/lib/supabase/servidor'
import type { Membro } from '@/lib/tipos'
import { desativar, transferir } from '../../acoes'

export const metadata = { title: 'Desativar vínculo' }

type Bloqueio = { id: string; interino: boolean; cargo: { nome: string }; mandato: { nome: string; fim: string; organizacao_id: string } }

// Fluxo da seção 8-B: desativação bloqueada enquanto a pessoa ocupa cargo
// nesta organização; a transferência (ou nomeação interina) libera.
export default async function DesativarMembro({ params }: { params: Promise<{ org: string; pessoa: string }> }) {
  const { org, pessoa } = await params
  const sb = await clienteServidor()
  const { data } = await sb.rpc('membros_da_organizacao', { p_org: org })
  const membros = (data ?? []) as Membro[]
  const m = membros.find((x) => x.pessoa_id === pessoa && x.ativo)
  if (!m) notFound()

  const hoje = new Date().toISOString().slice(0, 10)
  const { data: ocup } = await sb
    .from('ocupacao_cargo')
    .select('id, interino, cargo:cargo_id(nome), mandato:mandato_id!inner(nome, fim, organizacao_id)')
    .eq('pessoa_id', pessoa)
    .eq('mandato.organizacao_id', org)
    .is('fim', null)
  const bloqueios = ((ocup ?? []) as unknown as Bloqueio[]).filter((b) => b.mandato.fim >= hoje)
  const candidatos = membros.filter((x) => x.ativo && x.pessoa_id !== pessoa)

  return (
    <>
      <p><Link href={`/secretaria/${org}`}>← Membros</Link></p>
      <h2>Desativar {m.nome}</h2>
      <p className="suave">
        Desativar bloqueia o acesso e as notificações desta organização, mas preserva o histórico (cargos e
        presenças). Vínculos com outras organizações não são afetados.
      </p>

      {bloqueios.length > 0 ? (
        <>
          <p className="aviso erro">
            {m.nome.split(' ')[0]} ocupa {bloqueios.length === 1 ? 'um cargo' : `${bloqueios.length} cargos`} na gestão
            vigente. Transfira antes de desativar.
          </p>
          {bloqueios.map((b) => (
            <div key={b.id} className="cartao">
              <strong>{b.cargo.nome}</strong> <span className="suave">· {b.mandato.nome}</span>
              <Formulario acao={transferir.bind(null, org)} rotulo="Transferir cargo">
                <input type="hidden" name="ocupacao" value={b.id} />
                <input type="hidden" name="pessoa" value={pessoa} />
                <div className="grade-2">
                  <label>Sucessor
                    <select name="sucessor" required defaultValue="">
                      <option value="" disabled>Escolha…</option>
                      {candidatos.map((c) => <option key={c.pessoa_id} value={c.pessoa_id}>{c.nome}</option>)}
                    </select>
                  </label>
                  <label>A partir de<input name="inicio" type="date" defaultValue={hoje} required /></label>
                </div>
                <label className="caixa">
                  <input type="checkbox" name="interino" /> Nomeação interina (saída urgente: falecimento, afastamento,
                  desligamento) — fica sinalizada até a nomeação definitiva
                </label>
              </Formulario>
            </div>
          ))}
        </>
      ) : (
        <Formulario acao={desativar.bind(null, org)} rotulo="Desativar vínculo" perigo
                    confirmar={`Desativar o vínculo de ${m.nome} com esta organização?`}>
          <input type="hidden" name="vinculo" value={m.vinculo_id!} />
          <input type="hidden" name="pessoa" value={pessoa} />
          <label>Motivo (opcional)<input name="motivo" placeholder="ex.: maioridade, transferência, a pedido" /></label>
        </Formulario>
      )}
    </>
  )
}

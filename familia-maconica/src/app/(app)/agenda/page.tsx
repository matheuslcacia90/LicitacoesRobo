import Link from 'next/link'
import { CartaoEvento } from '@/componentes/CartaoEvento'
import { exigirPerfilAtivo } from '@/lib/sessao'
import { clienteServidor } from '@/lib/supabase/servidor'
import { FUSO, deslocarMes, intervaloDoMes, mesAtual, nomeMes } from '@/lib/regras'
import type { EventoAgenda } from '@/lib/tipos'

export const metadata = { title: 'Agenda' }

const chaveDia = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' })

export default async function Agenda({ searchParams }: { searchParams: Promise<{ mes?: string; org?: string }> }) {
  const perfil = await exigirPerfilAtivo()
  const { mes: mesParam, org } = await searchParams
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesAtual()
  const { de, ate, ref } = intervaloDoMes(mes)

  const sb = await clienteServidor()
  const { data, error } = await sb.rpc('agenda', { p_de: de, p_ate: ate })
  if (error) throw error
  let eventos = data as EventoAgenda[]
  if (org) eventos = eventos.filter((e) => e.organizacao_id === org)

  const dias = new Map<string, EventoAgenda[]>()
  for (const e of eventos) {
    const k = chaveDia.format(new Date(e.inicio))
    dias.set(k, [...(dias.get(k) ?? []), e])
  }
  const link = (m: string, o?: string) => `/agenda?mes=${m}${o ? `&org=${o}` : ''}`

  return (
    <>
      <div className="linha entre">
        <Link className="botao secundario pequeno" href={link(deslocarMes(mes, -1), org)}>‹</Link>
        <h1 style={{ margin: 0 }}>{nomeMes(ref)}</h1>
        <Link className="botao secundario pequeno" href={link(deslocarMes(mes, 1), org)}>›</Link>
      </div>
      <nav className="navegacao-secundaria" style={{ marginTop: 12 }}>
        <Link href={link(mes)} aria-current={!org ? 'page' : undefined}>Todas</Link>
        {perfil.vinculos.map((v) => (
          <Link key={v.organizacao_id} href={link(mes, v.organizacao_id)}
                aria-current={org === v.organizacao_id ? 'page' : undefined}>
            {v.organizacao}
          </Link>
        ))}
      </nav>
      {dias.size === 0 && <p className="suave">Nenhum evento neste mês.</p>}
      {[...dias.entries()].map(([dia, lista]) => (
        <section key={dia}>
          <h2 style={{ textTransform: 'capitalize' }}>{dia}</h2>
          {lista.map((e) => <CartaoEvento key={e.id} e={e} />)}
        </section>
      ))}
    </>
  )
}

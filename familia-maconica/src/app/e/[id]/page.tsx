import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { buscarEventoPublico } from '@/lib/eventoPublico'
import { FUSO, hora } from '@/lib/regras'

const dataLonga = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const e = await buscarEventoPublico((await params).id)
  return e ? { title: e.titulo, description: `${e.organizacoes.join(' · ')} — ${dataLonga.format(new Date(e.inicio))}` } : {}
}

// Página aberta para divulgar filantropia e cerimônias públicas (serve de cartaz).
export default async function EventoAberto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const e = await buscarEventoPublico(id)
  if (!e) notFound()
  return (
    <main className="estreita" style={{ textAlign: 'center' }}>
      <p className="suave">{e.organizacoes.join(' · ')}</p>
      <h1 style={{ fontSize: '1.8rem' }}>{e.titulo}</h1>
      <p style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>{dataLonga.format(new Date(e.inicio))}</p>
      <p style={{ fontSize: '1.1rem' }}>{hora(e.inicio)} às {hora(e.fim)}</p>
      {e.local && <p><strong>{e.local}</strong>{e.endereco && <><br />{e.endereco}</>}</p>}
      {e.descricao && <p style={{ whiteSpace: 'pre-line' }}>{e.descricao}</p>}
      <p><a className="botao" href={`/e/${id}/ics`}>Adicionar ao calendário</a></p>
    </main>
  )
}

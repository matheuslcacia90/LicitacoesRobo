import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { dataIcs, escapar } from './ics'

export type EventoPublico = {
  titulo: string
  descricao: string | null
  inicio: string
  fim: string
  local: string | null
  endereco: string | null
  organizacao: string
  organizacoes: string[]
}

// Leitura anônima: só eventos marcados como públicos e não cancelados.
export async function buscarEventoPublico(id: string): Promise<EventoPublico | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { data } = await sb.rpc('evento_publico', { p_evento: id })
  return (data as EventoPublico | null) ?? null
}

export function gerarIcs(id: string, e: EventoPublico): string {
  const local = [e.local, e.endereco].filter(Boolean).join(' - ')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Familia Maconica//PT-BR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${id}@familia-maconica`,
    `DTSTAMP:${dataIcs(new Date().toISOString())}`,
    `DTSTART:${dataIcs(e.inicio)}`,
    `DTEND:${dataIcs(e.fim)}`,
    `SUMMARY:${escapar(e.titulo)}`,
    ...(e.descricao ? [`DESCRIPTION:${escapar(e.descricao)}`] : []),
    ...(local ? [`LOCATION:${escapar(local)}`] : []),
    `ORGANIZER;CN=${escapar(e.organizacao)}:MAILTO:noreply@example.invalid`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
}

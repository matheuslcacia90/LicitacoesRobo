import { TOKEN_VALIDO, hashToken } from '@/lib/assinatura'
import { gerarCalendario, type EventoCalendario } from '@/lib/ics'
import { clienteServico } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

// Lido pelo Google Agenda / calendário do iPhone, sem login: o segredo está no
// próprio link. Link inválido, revogado ou de conta inativa devolve um
// calendário vazio (não revela se o link existiu).
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, '')
  let eventos: EventoCalendario[] = []
  if (TOKEN_VALIDO.test(token)) {
    const { data, error } = await clienteServico().rpc('agenda_por_token', { p_token_hash: hashToken(token) })
    if (error) return new Response('Erro ao gerar a agenda', { status: 503 })
    eventos = (data ?? []) as EventoCalendario[]
  }
  return new Response(gerarCalendario(eventos), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="familia-maconica.ics"',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

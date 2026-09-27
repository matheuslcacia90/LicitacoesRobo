import { buscarEventoPublico, gerarIcs } from '@/lib/eventoPublico'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const e = await buscarEventoPublico(id)
  if (!e) return new Response('Evento não encontrado', { status: 404 })
  return new Response(gerarIcs(id, e), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="evento-${id.slice(0, 8)}.ics"`,
    },
  })
}

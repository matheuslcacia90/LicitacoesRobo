import { NextResponse, type NextRequest } from 'next/server'
import { despachar } from '@/lib/despacho'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Chamado pelo agendador (Vercel Cron, pg_cron ou outro) a cada poucos minutos.
async function tratar(request: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo || request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const resultado = await despachar()
  return NextResponse.json(resultado)
}

export const GET = tratar
export const POST = tratar

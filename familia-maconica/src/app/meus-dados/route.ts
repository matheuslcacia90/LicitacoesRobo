import { NextResponse, type NextRequest } from 'next/server'
import { clienteServidor } from '@/lib/supabase/servidor'

// Acesso e portabilidade (LGPD art. 18): baixa em JSON os dados do titular ou,
// com ?pessoa=<id>, os de um dependente. Quem pode baixar é decidido no banco
// (exportar_dados). Fica fora do layout (app) para contas inativas também usarem.
export async function GET(request: NextRequest) {
  const sb = await clienteServidor()
  const { data: nivel } = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
  if (nivel?.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') {
    return NextResponse.redirect(new URL('/seguranca', request.url))
  }

  const pessoa = request.nextUrl.searchParams.get('pessoa')
  const { data, error } = await sb.rpc('exportar_dados', pessoa ? { p_pessoa: pessoa } : {})
  if (error) return new Response(error.message, { status: 403 })

  const dia = new Date().toISOString().slice(0, 10)
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="meus-dados-${dia}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}

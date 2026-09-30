import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { clienteServidor } from '@/lib/supabase/servidor'

// Destino dos links de e-mail (convite e recuperação). Aceita os três formatos:
//   ?token_hash=…&type=invite|recovery  modelos do projeto (supabase/templates, exigem SMTP próprio)
//   ?code=…                             fluxo PKCE (recuperação pedida pelo app)
//   #access_token=…                     modelo padrão do Supabase: o fragmento não chega ao
//                                       servidor; /auth/sessao o lê no navegador
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const tokenHash = url.searchParams.get('token_hash')
  const tipo = url.searchParams.get('type') as EmailOtpType | null
  const code = url.searchParams.get('code')
  const destino = url.clone()
  destino.search = ''

  if (tokenHash && tipo && ['invite', 'recovery', 'email', 'signup'].includes(tipo)) {
    const sb = await clienteServidor()
    const { error } = await sb.auth.verifyOtp({ type: tipo, token_hash: tokenHash })
    destino.pathname = error ? '/entrar' : '/primeiro-acesso'
    if (error) destino.searchParams.set('link', 'expirado')
    return NextResponse.redirect(destino)
  }
  if (code) {
    const sb = await clienteServidor()
    const { error } = await sb.auth.exchangeCodeForSession(code)
    destino.pathname = error ? '/entrar' : '/primeiro-acesso'
    if (error) destino.searchParams.set('link', 'expirado')
    return NextResponse.redirect(destino)
  }
  // Sem parâmetros: a sessão pode estar no fragmento (#…), que o navegador mantém no redirecionamento.
  destino.pathname = '/auth/sessao'
  return NextResponse.redirect(destino)
}

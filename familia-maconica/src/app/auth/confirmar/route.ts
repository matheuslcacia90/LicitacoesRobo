import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { clienteServidor } from '@/lib/supabase/servidor'

// Destino dos links de e-mail (convite e recuperação). Os modelos de
// e-mail do Supabase devem apontar para:
//   {{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=invite
//   {{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const tokenHash = url.searchParams.get('token_hash')
  const tipo = url.searchParams.get('type') as EmailOtpType | null
  const destino = url.clone()
  destino.search = ''

  if (tokenHash && tipo && ['invite', 'recovery', 'email', 'signup'].includes(tipo)) {
    const sb = await clienteServidor()
    const { error } = await sb.auth.verifyOtp({ type: tipo, token_hash: tokenHash })
    if (!error) {
      destino.pathname = '/primeiro-acesso'
      return NextResponse.redirect(destino)
    }
  }
  destino.pathname = '/entrar'
  destino.searchParams.set('link', 'expirado')
  return NextResponse.redirect(destino)
}

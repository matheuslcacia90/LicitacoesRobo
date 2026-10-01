import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLICAS = ['/entrar', '/recuperar', '/auth/', '/e/', '/calendario/', '/primeiro-acesso', '/api/notificacoes/despachar']

// Renova a sessão do Supabase a cada requisição e manda para /entrar quem
// não está logado. As permissões de fato são checadas no banco (RLS).
export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request })
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value))
          resposta = NextResponse.next({ request })
          lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options))
        },
      },
    },
  )
  const { data } = await sb.auth.getClaims()
  const caminho = request.nextUrl.pathname
  if (!data && !PUBLICAS.some((p) => caminho.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/entrar'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return resposta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icones/|manifest.webmanifest|sw.js).*)'],
}

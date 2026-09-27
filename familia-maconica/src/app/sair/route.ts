import { NextResponse, type NextRequest } from 'next/server'
import { clienteServidor } from '@/lib/supabase/servidor'

export async function POST(request: NextRequest) {
  const sb = await clienteServidor()
  await sb.auth.signOut()
  return NextResponse.redirect(new URL('/entrar', request.url), { status: 303 })
}

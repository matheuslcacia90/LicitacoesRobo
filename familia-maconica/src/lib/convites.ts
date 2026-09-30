import 'server-only'
import { clienteServico } from './supabase/servidor'

// Envia o link de primeiro acesso. A pessoa cria a própria senha;
// a Secretaria nunca define nem vê senhas.
export async function enviarConvites(emails: string[]): Promise<string[]> {
  if (!emails.length) return []
  const admin = clienteServico()
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const falhas: string[] = []
  for (const email of emails) {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${site}/auth/confirmar`,
    })
    if (error && !/already been registered/i.test(error.message)) falhas.push(email)
  }
  return falhas
}

'use server'
import { redirect } from 'next/navigation'
import { clienteServico, clienteServidor } from '@/lib/supabase/servidor'
import { hora } from '@/lib/regras'
import type { EstadoAcao } from '@/lib/tipos'

export async function entrar(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase()
  const senha = String(fd.get('senha') ?? '')
  if (!email || !senha) return { erro: 'Informe e-mail e senha.' }

  // Bloqueio temporário após 5 tentativas erradas.
  const servico = clienteServico()
  const { data: bloqueio } = await servico.rpc('login_bloqueado', { p_email: email })
  if (bloqueio) return { erro: `Muitas tentativas erradas. Tente de novo às ${hora(bloqueio as string)}.` }

  const sb = await clienteServidor()
  const { error } = await sb.auth.signInWithPassword({ email, password: senha })
  if (error) {
    const { data: ate } = await servico.rpc('registrar_falha_login', { p_email: email })
    return {
      erro: ate
        ? `Muitas tentativas erradas. Acesso bloqueado até ${hora(ate as string)}.`
        : 'E-mail ou senha incorretos.',
    }
  }
  await servico.rpc('limpar_falhas_login', { p_email: email })
  redirect('/')
}

export async function recuperar(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase()
  if (email) {
    const sb = await clienteServidor()
    await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/primeiro-acesso`,
    })
  }
  // Mesma resposta sempre, para não revelar quem tem cadastro.
  return { ok: 'Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.' }
}

export async function definirSenha(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const { validarSenha } = await import('@/lib/regras')
  const senha = String(fd.get('senha') ?? '')
  const confirmacao = String(fd.get('confirmacao') ?? '')
  const problema = validarSenha(senha)
  if (problema) return { erro: problema }
  if (senha !== confirmacao) return { erro: 'As senhas não conferem.' }
  const sb = await clienteServidor()
  const { error } = await sb.auth.updateUser({ password: senha })
  if (error) return { erro: 'Não foi possível salvar a senha. Peça um novo link à Secretaria.' }
  redirect('/')
}

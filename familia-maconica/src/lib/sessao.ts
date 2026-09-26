import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { clienteServidor } from './supabase/servidor'
import type { Perfil } from './tipos'

// Perfil do usuário logado (uma chamada por requisição).
export const obterPerfil = cache(async (): Promise<Perfil | null> => {
  const sb = await clienteServidor()
  const { data: claims } = await sb.auth.getClaims()
  if (!claims) return null
  const { data, error } = await sb.rpc('meu_perfil')
  if (error) throw error
  return (data as Perfil | null) ?? null
})

export async function exigirPerfilAtivo(): Promise<Perfil> {
  const perfil = await obterPerfil()
  if (!perfil) redirect('/entrar')
  if (!perfil.pessoa.conta_ativa) redirect('/conta-inativa')
  return perfil
}

export function ehSecretariaDe(perfil: Perfil, orgId: string) {
  return perfil.vinculos.some((v) => v.organizacao_id === orgId && v.secretaria)
}

export function precisaDoisFatores(perfil: Perfil) {
  return perfil.admin || perfil.vinculos.some((v) => v.secretaria)
}

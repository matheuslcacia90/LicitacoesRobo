'use server'
import { checar, executar, opcional, texto } from '@/lib/acao'
import { enviarConvites } from '@/lib/convites'
import { clienteServidor } from '@/lib/supabase/servidor'
import type { EstadoAcao, TipoOrganizacao } from '@/lib/tipos'

export async function criarNucleo(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('criar_nucleo', { p_nome: texto(fd, 'nome'), p_cidade: opcional(fd, 'cidade'), p_uf: opcional(fd, 'uf') }))
    return 'Núcleo criado.'
  }, '/admin')
}

export async function criarLocal(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('criar_local', { p_nucleo: texto(fd, 'nucleo'), p_nome: texto(fd, 'nome'), p_endereco: opcional(fd, 'endereco') }))
    return 'Local criado.'
  }, '/admin')
}

export async function criarOrganizacao(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('criar_organizacao', {
      p_nucleo: texto(fd, 'nucleo'), p_tipo: texto(fd, 'tipo') as TipoOrganizacao, p_nome: texto(fd, 'nome'),
      p_numero: opcional(fd, 'numero'), p_jurisdicao: opcional(fd, 'jurisdicao'), p_local: opcional(fd, 'local'),
    }))
    return 'Organização criada.'
  }, '/admin')
}

export async function nomearSecretaria(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    const r = checar(await sb.rpc('nomear_secretaria', {
      p_org: texto(fd, 'org'), p_nome: texto(fd, 'nome'), p_email: texto(fd, 'email'),
    })) as { convites: string[] }
    const falhas = await enviarConvites(r.convites)
    if (falhas.length) return 'Secretaria nomeada, mas o convite não foi enviado. Tente nomear de novo.'
    return r.convites.length ? 'Secretaria nomeada. Convite de primeiro acesso enviado.' : 'Secretaria nomeada.'
  }, '/admin')
}

export async function revogarSecretaria(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('revogar_secretaria', { p_org: texto(fd, 'org'), p_pessoa: texto(fd, 'pessoa') }))
    return 'Perfil de Secretaria removido.'
  }, '/admin')
}

'use server'
import { redirect } from 'next/navigation'
import { checar, executar, texto } from '@/lib/acao'
import { VERSAO_TERMO } from '@/lib/regras'
import { clienteServico, clienteServidor } from '@/lib/supabase/servidor'
import type { EstadoAcao, TipoEvento, TipoResposta } from '@/lib/tipos'

export async function responderEvento(evento: string, pessoa: string, resposta: TipoResposta) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('responder_evento', { p_evento: evento, p_resposta: resposta, p_pessoa: pessoa }))
  }, ['/', '/agenda'])
}

export async function atualizarCelular(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('atualizar_meu_celular', { p_celular: texto(fd, 'celular') }))
    return 'Celular atualizado.'
  }, '/perfil')
}

export async function salvarPreferencias(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    const tipos: TipoEvento[] = ['reuniao', 'conjunta', 'individual', 'convite', 'evento']
    for (const t of tipos) {
      checar(await sb.rpc('salvar_preferencia', {
        p_tipo: t, p_push: fd.get(`${t}_push`) === 'on', p_email: fd.get(`${t}_email`) === 'on',
      }))
    }
    return 'Preferências salvas.'
  }, '/perfil')
}

export async function registrarPush(inscricao: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('registrar_push', {
      p_endpoint: inscricao.endpoint, p_p256dh: inscricao.keys.p256dh, p_auth: inscricao.keys.auth,
    }))
    return 'Notificações ativadas neste aparelho.'
  })
}

export async function removerPush(endpoint: string) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('remover_push', { p_endpoint: endpoint }))
    return 'Notificações desativadas neste aparelho.'
  })
}

export async function marcarLidas() {
  const sb = await clienteServidor()
  await sb.rpc('marcar_notificacoes_lidas')
  redirect('/notificacoes')
}

// ---- Responsável legal ----
export async function aprovarMenor(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    if (fd.get('aceite') !== 'on') throw new Error('Marque que leu e aceita o termo.')
    const sb = await clienteServidor()
    checar(await sb.rpc('aprovar_conta_menor', {
      p_menor: texto(fd, 'menor'),
      p_versao_termo: VERSAO_TERMO,
      p_forma_verificacao: 'Aceite no app pelo responsável autenticado por e-mail e senha',
    }))
    return 'Conta aprovada. Seu dependente já pode entrar.'
  }, ['/perfil', '/'])
}

export async function revogarMenor(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('revogar_consentimento', { p_menor: texto(fd, 'menor') }))
    return 'Consentimento revogado. A conta do dependente foi suspensa.'
  }, '/perfil')
}

export async function autorizarFoto(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('autorizar_foto', { p_menor: texto(fd, 'menor'), p_autorizada: fd.get('autorizada') === 'sim' }))
    return 'Autorização de foto atualizada.'
  }, '/perfil')
}

// ---- Exclusão definitiva (LGPD) ----
async function anonimizar(pessoa: string) {
  const sb = await clienteServidor()
  const authId = checar(await sb.rpc('anonimizar_pessoa', { p_pessoa: pessoa })) as string | null
  if (authId) await clienteServico().auth.admin.deleteUser(authId)
  return sb
}

export async function excluirMinhaConta(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  if (texto(fd, 'confirmacao').toUpperCase() !== 'EXCLUIR') return { erro: 'Digite EXCLUIR para confirmar.' }
  const r = await executar(async () => {
    const sb = await anonimizar(texto(fd, 'pessoa'))
    await sb.auth.signOut()
  })
  if (r.erro) return r
  redirect('/entrar')
}

export async function excluirDependente(_: EstadoAcao, fd: FormData) {
  return executar(async () => {
    if (texto(fd, 'confirmacao').toUpperCase() !== 'EXCLUIR') throw new Error('Digite EXCLUIR para confirmar.')
    await anonimizar(texto(fd, 'menor'))
    return 'Dados do dependente excluídos.'
  }, '/perfil')
}

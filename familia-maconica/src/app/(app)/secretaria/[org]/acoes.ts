'use server'
import { redirect } from 'next/navigation'
import { checar, executar, opcional, texto } from '@/lib/acao'
import { enviarConvites } from '@/lib/convites'
import { isoDeBrasilia } from '@/lib/regras'
import { clienteServidor } from '@/lib/supabase/servidor'
import type { CargoBloqueante, EstadoAcao, Papel, TipoEvento } from '@/lib/tipos'

const base = (org: string) => `/secretaria/${org}`

// ---------------- Membros ----------------
export async function cadastrar(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    const r = checar(await sb.rpc('cadastrar_membro', {
      p_org: org,
      p_nome: texto(fd, 'nome'),
      p_nascimento: opcional(fd, 'nascimento'),
      p_email: opcional(fd, 'email'),
      p_celular: opcional(fd, 'celular'),
      p_id_oficial: opcional(fd, 'id_oficial'),
      p_papel: (texto(fd, 'papel') || 'membro') as Papel,
      p_resp_nome: opcional(fd, 'resp_nome'),
      p_resp_email: opcional(fd, 'resp_email'),
      p_resp_celular: opcional(fd, 'resp_celular'),
      p_resp_parentesco: opcional(fd, 'resp_parentesco'),
    })) as { reutilizada: boolean; convites: string[] }
    const falhas = await enviarConvites(r.convites)
    const partes = [r.reutilizada ? 'Pessoa já cadastrada em outra organização: vínculo adicionado à mesma conta.' : 'Cadastro feito.']
    if (r.convites.length) partes.push(`Convite de primeiro acesso enviado para ${r.convites.join(', ')}.`)
    if (falhas.length) partes.push(`Falha ao enviar para ${falhas.join(', ')} — use "Reenviar convite".`)
    return partes.join(' ')
  }, base(org))
}

export async function reenviarConvite(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    // Só encontra a pessoa se ela for membro de organização desta Secretaria (RLS).
    const { data } = await sb.from('pessoa').select('email, auth_user_id').eq('id', texto(fd, 'pessoa')).maybeSingle()
    if (!data?.email) throw new Error('Pessoa sem e-mail cadastrado.')
    if (data.auth_user_id) throw new Error('Esta pessoa já fez o primeiro acesso. Ela pode usar "Esqueci a senha".')
    const falhas = await enviarConvites([data.email])
    if (falhas.length) throw new Error('Não foi possível enviar o convite agora.')
    return `Convite reenviado para ${data.email}.`
  }, base(org))
}

export async function desativar(org: string, _: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const r = await executar(async () => {
    const sb = await clienteServidor()
    const r = checar(await sb.rpc('desativar_vinculo', {
      p_vinculo: texto(fd, 'vinculo'), p_motivo: opcional(fd, 'motivo'),
    })) as { ok: boolean; cargos?: CargoBloqueante[] }
    if (!r.ok) {
      throw new Error(`Transfira antes: ${r.cargos!.map((c) => c.cargo).join(', ')}.`)
    }
  }, base(org))
  if (r.erro) return r
  redirect(base(org))
}

export async function reativar(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('reativar_membro', {
      p_org: org, p_pessoa: texto(fd, 'pessoa'), p_papel: (texto(fd, 'papel') || 'membro') as Papel,
    }))
    return 'Vínculo reativado.'
  }, base(org))
}

// ---------------- Cargos ----------------
export async function criarMandato(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('criar_mandato', {
      p_org: org, p_nome: texto(fd, 'nome'), p_inicio: texto(fd, 'inicio'), p_fim: texto(fd, 'fim'),
    }))
    return 'Gestão criada.'
  }, `${base(org)}/cargos`)
}

export async function criarCargo(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('criar_cargo', {
      p_org: org, p_nome: texto(fd, 'nome'), p_ordem: Number(texto(fd, 'ordem') || 500),
      p_vagas: Number(texto(fd, 'vagas') || 1), p_para_adulto: fd.get('para_adulto') === 'on',
    }))
    return 'Cargo criado.'
  }, `${base(org)}/cargos`)
}

export async function atribuir(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('atribuir_cargo', {
      p_mandato: texto(fd, 'mandato'), p_cargo: texto(fd, 'cargo'), p_pessoa: texto(fd, 'pessoa'),
      p_inicio: opcional(fd, 'inicio'), p_interino: fd.get('interino') === 'on',
    }))
    return 'Cargo atribuído.'
  }, `${base(org)}/cargos`)
}

export async function transferir(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('transferir_cargo', {
      p_ocupacao: texto(fd, 'ocupacao'), p_sucessor: texto(fd, 'sucessor'),
      p_inicio: texto(fd, 'inicio'), p_interino: fd.get('interino') === 'on',
    }))
    return 'Cargo transferido.'
  }, [`${base(org)}/cargos`, base(org), `${base(org)}/membros/${texto(fd, 'pessoa')}`])
}

export async function efetivar(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    checar(await sb.rpc('efetivar_interino', { p_ocupacao: texto(fd, 'ocupacao') }))
    return 'Nomeação definitiva registrada.'
  }, `${base(org)}/cargos`)
}

// ---------------- Agenda ----------------
export async function criarEvento(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const data = texto(fd, 'data')
    const inicio = isoDeBrasilia(data, texto(fd, 'hora_inicio'))
    const fim = isoDeBrasilia(texto(fd, 'data_fim') || data, texto(fd, 'hora_fim'))
    const sb = await clienteServidor()
    const ids = checar(await sb.rpc('criar_evento', {
      p_org: org,
      p_tipo: texto(fd, 'tipo') as TipoEvento,
      p_titulo: texto(fd, 'titulo'),
      p_inicio: inicio,
      p_fim: fim,
      p_local: opcional(fd, 'local'),
      p_descricao: opcional(fd, 'descricao'),
      p_publico: fd.get('publico') === 'on',
      p_orgs_convidadas: fd.getAll('orgs').map(String),
      p_pessoas: fd.getAll('pessoas').map(String),
      p_repetir_semanas: Number(texto(fd, 'repetir') || 0),
    })) as string[]
    return ids.length > 1 ? `${ids.length} datas criadas. Membros avisados.` : 'Evento criado. Membros avisados.'
  }, [`${base(org)}/agenda`, '/agenda', '/'])
}

export async function responderParticipacao(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const aceitar = texto(fd, 'decisao') === 'aceitar'
    const sb = await clienteServidor()
    checar(await sb.rpc('responder_participacao', { p_evento: texto(fd, 'evento'), p_org: org, p_aceitar: aceitar }))
    return aceitar ? 'Aceito. Seus membros foram avisados.' : 'Convite recusado.'
  }, [`${base(org)}/agenda`, '/'])
}

export async function cancelarEvento(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const sb = await clienteServidor()
    const n = checar(await sb.rpc('cancelar_evento', {
      p_evento: texto(fd, 'evento'), p_serie: fd.get('serie') === 'on',
    })) as number
    return n > 1 ? `${n} datas canceladas. Todos foram avisados.` : 'Evento cancelado. Todos foram avisados.'
  }, [`${base(org)}/agenda`, '/agenda', '/'])
}

export async function reagendarEvento(org: string, _: EstadoAcao, fd: FormData) {
  return executar(async () => {
    const data = texto(fd, 'data')
    const sb = await clienteServidor()
    checar(await sb.rpc('reagendar_evento', {
      p_evento: texto(fd, 'evento'),
      p_inicio: isoDeBrasilia(data, texto(fd, 'hora_inicio')),
      p_fim: isoDeBrasilia(data, texto(fd, 'hora_fim')),
      p_local: opcional(fd, 'local'),
    }))
    return 'Horário alterado. Todos foram avisados.'
  }, [`${base(org)}/agenda`, '/agenda', '/'])
}

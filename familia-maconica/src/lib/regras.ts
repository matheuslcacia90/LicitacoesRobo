// Regras de apresentação compartilhadas. As regras que protegem dados
// ficam no banco (supabase/migrations); estas só orientam a interface.
import type { Faixa, MetricasOrganizacao, TipoEvento, TipoOrganizacao, TipoResposta } from './tipos'

export const FUSO = 'America/Sao_Paulo'

// Versão do termo de consentimento para contas de menores (LGPD art. 14).
export const VERSAO_TERMO = 'termo-menores-v1'

export const NOME_TIPO_ORGANIZACAO: Record<TipoOrganizacao, string> = {
  loja: 'Loja',
  capitulo_demolay: 'Capítulo DeMolay',
  castelo_escudeiros: 'Castelo de Escudeiros',
  bethel: 'Bethel de Filhas de Jó',
  colmeia: 'Colmeia',
}

export const NOME_TIPO_EVENTO: Record<TipoEvento, string> = {
  reuniao: 'Reunião',
  conjunta: 'Atividade conjunta',
  individual: 'Atividade individual',
  convite: 'Convite',
  evento: 'Evento',
}

export const NOME_RESPOSTA: Record<TipoResposta, string> = {
  confirmado: 'Vou',
  ausente: 'Não vou',
  aceito: 'Aceito',
  recusado: 'Recuso',
  ciente: 'Ciente',
  concluido: 'Concluído',
}

export const NOME_FAIXA: Record<Faixa, string> = {
  crianca: 'menor de 12',
  adolescente: '12 a 15 anos',
  jovem: '16 e 17 anos',
  adulto: 'adulto',
}

// Espelha app.faixa() do banco.
export function faixaEtaria(nascimento: string | Date | null, hoje: Date = new Date()): Faixa {
  if (!nascimento) return 'adulto'
  const n = typeof nascimento === 'string' ? new Date(nascimento + 'T12:00:00') : nascimento
  let idade = hoje.getFullYear() - n.getFullYear()
  const m = hoje.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < n.getDate())) idade--
  if (idade < 12) return 'crianca'
  if (idade < 16) return 'adolescente'
  if (idade < 18) return 'jovem'
  return 'adulto'
}

// Respostas possíveis por tipo de evento (espelha responder_evento()).
export function respostasPossiveis(tipo: TipoEvento): TipoResposta[] {
  switch (tipo) {
    case 'individual':
      return ['ciente', 'concluido']
    case 'convite':
      return ['aceito', 'recusado']
    default:
      return ['confirmado', 'ausente']
  }
}

// Reuniões não podem ser silenciadas (espelha salvar_preferencia()).
export function podeSilenciar(tipo: TipoEvento): boolean {
  return tipo !== 'reuniao'
}

export function validarSenha(senha: string): string | null {
  if (senha.length < 8) return 'A senha precisa ter no mínimo 8 caracteres.'
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'Use letras e números na senha.'
  return null
}

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO, weekday: 'short', day: '2-digit', month: '2-digit',
})
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
const fmtMes = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, month: 'long', year: 'numeric' })

export function dataCurta(iso: string) {
  return fmtData.format(new Date(iso)).replace('.', '')
}
export function hora(iso: string) {
  return fmtHora.format(new Date(iso))
}
export function nomeMes(d: Date) {
  const s = fmtMes.format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Converte "2026-10-01" + "19:30" (horário de Brasília) em ISO UTC.
// Brasília não tem horário de verão desde 2019: UTC−03:00 fixo.
export function isoDeBrasilia(data: string, horaMin: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(horaMin)) {
    throw new Error('Data ou hora inválida.')
  }
  const d = new Date(`${data}T${horaMin}:00-03:00`)
  if (Number.isNaN(d.getTime())) throw new Error('Data ou hora inválida.')
  return d.toISOString()
}

// Intervalo [início, fim) de um mês "AAAA-MM" em Brasília.
export function intervaloDoMes(mes: string): { de: string; ate: string; ref: Date } {
  const [a, m] = mes.split('-').map(Number)
  if (!a || !m || m < 1 || m > 12) throw new Error('Mês inválido.')
  const de = new Date(`${a}-${String(m).padStart(2, '0')}-01T00:00:00-03:00`)
  const prox = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
  const ate = new Date(`${prox}-01T00:00:00-03:00`)
  return { de: de.toISOString(), ate: ate.toISOString(), ref: new Date(`${a}-${String(m).padStart(2, '0')}-15T12:00:00-03:00`) }
}

export function mesAtual(agora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit' }).format(agora)
  return p.slice(0, 7)
}

export function deslocarMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number)
  const total = a * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

// Mensagens do Postgres chegam como texto; remove prefixos técnicos.
export function mensagemErro(e: unknown): string {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  if (/permission denied|42501/i.test(msg)) return 'Você não tem permissão para esta ação.'
  if (/evento_sem_conflito_local/.test(msg)) return 'Conflito de uso do local neste horário.'
  return msg.replace(/^ERROR:\s*/, '')
}

// Metas da seção 10 do dossiê para o painel do piloto.
export type StatusMeta = 'ok' | 'alerta' | 'erro' | 'sem-dados'
export type Meta = { status: StatusMeta; valor: string; detalhe: string }

const pct = (parte: number, todo: number) => Math.round((parte / todo) * 100)

export function avaliarMetricas(m: MetricasOrganizacao, hoje: Date = new Date()) {
  const agenda: Meta = {
    status: m.eventos_proximos_30d > 0 ? 'ok' : 'erro',
    valor: `${m.eventos_proximos_30d} nos próximos 30 dias`,
    detalhe: `${m.reunioes_30d} reuniões lançadas nos últimos 30 dias`,
  }

  let cargos: Meta
  if (!m.gestao || !m.gestao_inicio) {
    cargos = { status: 'erro', valor: 'sem gestão vigente', detalhe: 'Meta: gestão cadastrada e cargos preenchidos em até 15 dias' }
  } else {
    const p = m.cargos_total ? pct(m.cargos_preenchidos, m.cargos_total) : 100
    const dias = Math.floor((hoje.getTime() - new Date(`${m.gestao_inicio}T00:00:00-03:00`).getTime()) / 86400_000)
    cargos = {
      status: p >= 100 ? 'ok' : dias <= 15 ? 'alerta' : 'erro',
      valor: `${p}% (${m.cargos_preenchidos} de ${m.cargos_total})`,
      detalhe: `${m.gestao}, iniciada há ${Math.max(dias, 0)} dia${dias === 1 ? '' : 's'}. Meta: 100% em até 15 dias`,
    }
  }

  const menores: Meta = m.menores_ativos === 0
    ? { status: 'sem-dados', valor: 'sem menores', detalhe: 'Meta: 70% com conta aprovada pelo responsável' }
    : {
        status: pct(m.menores_aprovados, m.menores_ativos) >= 70 ? 'ok' : 'erro',
        valor: `${pct(m.menores_aprovados, m.menores_ativos)}% (${m.menores_aprovados} de ${m.menores_ativos})`,
        detalhe: 'Meta: 70% com conta aprovada pelo responsável',
      }

  const uso: Meta = m.adultos_ativos === 0
    ? { status: 'sem-dados', valor: 'sem adultos', detalhe: 'Meta: 50% dos adultos usando por semana' }
    : {
        status: pct(m.adultos_semana, m.adultos_ativos) >= 50 ? 'ok' : 'erro',
        valor: `${pct(m.adultos_semana, m.adultos_ativos)}% (${m.adultos_semana} de ${m.adultos_ativos})`,
        detalhe: 'Meta: 50% dos adultos usando por semana',
      }

  return { agenda, cargos, menores, uso }
}

// "Domingo, 18 de outubro de 2026" (só a primeira letra maiúscula).
const DATA_LONGA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export function dataPorExtenso(iso: string): string {
  const s = DATA_LONGA.format(new Date(iso))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

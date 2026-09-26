// Regras de apresentação compartilhadas. As regras que protegem dados
// ficam no banco (supabase/migrations); estas só orientam a interface.
import type { Faixa, TipoEvento, TipoOrganizacao, TipoResposta } from './tipos'

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

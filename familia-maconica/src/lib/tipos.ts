export type TipoOrganizacao = 'loja' | 'capitulo_demolay' | 'castelo_escudeiros' | 'bethel' | 'colmeia'
export type TipoEvento = 'reuniao' | 'conjunta' | 'individual' | 'convite' | 'evento'
export type TipoResposta = 'confirmado' | 'ausente' | 'aceito' | 'recusado' | 'ciente' | 'concluido'
export type Faixa = 'crianca' | 'adolescente' | 'jovem' | 'adulto'
export type Papel = 'membro' | 'adulto'

export interface VinculoPerfil {
  vinculo_id: string
  organizacao_id: string
  organizacao: string
  tipo: TipoOrganizacao
  nucleo_id: string
  papel: Papel
  secretaria: boolean
}

export interface Dependente {
  pessoa_id: string
  nome: string
  faixa: Faixa
  email: string | null
  conta_aprovada_em: string | null
  foto_autorizada: boolean
  organizacoes: string[]
}

export interface Perfil {
  pessoa: {
    id: string
    nome: string
    email: string | null
    celular: string | null
    faixa: Faixa
    conta_ativa: boolean
    aguardando_aprovacao: boolean
  }
  admin: boolean
  vinculos: VinculoPerfil[]
  dependentes: Dependente[]
  preferencias: { tipo: TipoEvento; push: boolean; email: boolean }[]
  nao_lidas: number
}

export interface RespostaAgenda {
  pessoa_id: string
  nome: string
  eu: boolean
  resposta: TipoResposta | null
}

export interface EventoAgenda {
  id: string
  tipo: TipoEvento
  titulo: string
  descricao: string | null
  inicio: string
  fim: string
  local: string | null
  organizacao_id: string
  organizacao: string
  organizacoes: string[]
  publico: boolean
  cancelado: boolean
  serie_id: string | null
  eh_secretaria: boolean
  respostas: RespostaAgenda[]
}

export interface LinhaQuadro {
  mandato_id: string
  mandato: string
  cargo_id: string
  cargo: string
  ordem: number
  para_adulto: boolean
  ocupacao_id: string | null
  pessoa_id: string | null
  pessoa: string | null
  inicio: string | null
  fim: string | null
  interino: boolean | null
}

export interface Membro {
  vinculo_id: string | null
  pessoa_id: string
  nome: string
  papel: Papel
  faixa: Faixa | null
  secretaria: boolean
  ativo: boolean
  inicio: string | null
  fim: string | null
  email: string | null
  celular: string | null
  id_oficial: string | null
  primeiro_acesso_feito: boolean | null
  conta_aprovada: boolean | null
  cargos: string[]
  responsaveis: string[]
}

export interface CargoBloqueante {
  ocupacao_id: string
  cargo: string
  mandato: string
  interino: boolean
}

export interface EstadoAcao {
  erro?: string
  ok?: string
}

export type MetricasOrganizacao = {
  organizacao_id: string
  organizacao: string
  nucleo: string
  tipo: TipoOrganizacao
  reunioes_30d: number
  eventos_proximos_30d: number
  gestao: string | null
  gestao_inicio: string | null
  cargos_total: number
  cargos_preenchidos: number
  menores_ativos: number
  menores_aprovados: number
  adultos_ativos: number
  adultos_semana: number
}

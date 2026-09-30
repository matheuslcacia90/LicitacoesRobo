// Avalia a instalação para a página Admin → Diagnóstico. Recebe só presença
// de variáveis (nunca os valores), a configuração pública do Supabase Auth e
// os números de diagnostico_instalacao(), e diz o que falta e como corrigir.

export type StatusItem = 'ok' | 'alerta' | 'erro'
export type Item = { titulo: string; status: StatusItem; detalhe: string; correcao?: string }
export type Grupo = { titulo: string; itens: Item[] }

export type Ambiente = {
  serviceRole: boolean
  vapidPublica: boolean
  vapidPrivada: boolean
  cronSecret: boolean
  resend: boolean
  siteUrl: string | null
}

export type AgendamentoBanco = {
  nome: string
  agenda: string
  ativo: boolean
  ultima_status: string | null
  ultima_em: string | null
}

export type DiagnosticoBanco = {
  funcoes: Record<string, boolean>
  cargos_escudeiros: number
  cron: AgendamentoBanco[] | null
  ultima_resposta_http: { status: number | null; em: string; erro: boolean } | null
  fila: { pendentes: number; atrasadas: number; ultima_enviada_em: string | null; erros_24h: number }
  estrutura: {
    administradores: number
    administradores_com_login: number
    nucleos: number
    locais: number
    organizacoes: number
    organizacoes_com_secretaria: number
    pessoas_com_login: number
  }
}

export type Entrada = {
  ambiente: Ambiente
  host: string | null
  // null: não foi possível consultar /auth/v1/settings
  cadastroAberto: boolean | null
  // null: função ausente (migração 0010 não aplicada) ou erro na consulta
  banco: DiagnosticoBanco | null
  agora?: Date
}

const VARIAVEIS = 'Vercel → projeto → Settings → Environment Variables. Depois, faça um novo deploy.'
const ARQUIVO_AGENDAMENTO = 'No Supabase, SQL Editor: rode agendar-despacho-pronto.sql (com o CRON_SECRET atual da Vercel).'

export function haQuanto(iso: string, agora: Date): string {
  const min = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `há ${h} h`
  return `há ${Math.round(h / 24)} dias`
}

const minutosDesde = (iso: string, agora: Date) => (agora.getTime() - new Date(iso).getTime()) / 60_000

function hostDe(url: string): string | null {
  try { return new URL(url).host } catch { return null }
}

function grupoVercel(a: Ambiente, host: string | null): Grupo {
  const itens: Item[] = []
  itens.push(a.serviceRole
    ? { titulo: 'Chave de serviço do Supabase', status: 'ok', detalhe: 'Configurada.' }
    : { titulo: 'Chave de serviço do Supabase', status: 'erro',
        detalhe: 'Sem ela não saem convites, bloqueio de login, exclusão de conta nem avisos.',
        correcao: `Crie SUPABASE_SERVICE_ROLE_KEY como Sensitive (Supabase → Project Settings → API Keys → service_role). ${VARIAVEIS}` })

  const siteHost = a.siteUrl ? hostDe(a.siteUrl) : null
  if (!a.siteUrl || !siteHost) {
    itens.push({ titulo: 'Endereço do app', status: 'erro', detalhe: 'NEXT_PUBLIC_SITE_URL ausente ou inválida: os links de convite não funcionam.',
                 correcao: `Crie NEXT_PUBLIC_SITE_URL com o endereço público (ex.: https://familia-maconica.vercel.app). ${VARIAVEIS}` })
  } else if (host && host !== siteHost && !host.startsWith('localhost')) {
    itens.push({ titulo: 'Endereço do app', status: 'alerta',
                 detalhe: `Os links de convite apontam para ${siteHost}, mas este acesso é por ${host}.`,
                 correcao: 'Normal numa prévia da Vercel. Em produção, ajuste NEXT_PUBLIC_SITE_URL para o endereço que as pessoas usam.' })
  } else {
    itens.push({ titulo: 'Endereço do app', status: 'ok', detalhe: `Links de convite apontam para ${siteHost}.` })
  }

  itens.push(a.vapidPublica && a.vapidPrivada
    ? { titulo: 'Notificações push', status: 'ok', detalhe: 'Chaves VAPID configuradas.' }
    : { titulo: 'Notificações push', status: 'erro', detalhe: 'Faltam chaves VAPID: ninguém recebe aviso no celular.',
        correcao: `Gere com npm run vapid e crie NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY. ${VARIAVEIS}` })

  itens.push(a.cronSecret
    ? { titulo: 'Segredo do agendador', status: 'ok', detalhe: 'CRON_SECRET configurado.' }
    : { titulo: 'Segredo do agendador', status: 'erro', detalhe: 'Sem CRON_SECRET o despacho de avisos recusa todas as chamadas.',
        correcao: `Crie CRON_SECRET (Sensitive) e use o mesmo valor em agendar-despacho-pronto.sql. ${VARIAVEIS}` })

  itens.push(a.resend
    ? { titulo: 'Avisos por e-mail', status: 'ok', detalhe: 'Resend configurado.' }
    : { titulo: 'Avisos por e-mail', status: 'alerta', detalhe: 'Sem RESEND_API_KEY os avisos saem só por push.',
        correcao: `Opcional. Crie uma conta em resend.com, verifique o domínio e crie RESEND_API_KEY e EMAIL_REMETENTE. ${VARIAVEIS}` })

  return { titulo: 'Vercel', itens }
}

function grupoAuth(cadastroAberto: boolean | null): Grupo {
  const item: Item = cadastroAberto === null
    ? { titulo: 'Cadastro aberto', status: 'alerta', detalhe: 'Não foi possível consultar a configuração do Supabase Auth.' }
    : cadastroAberto
      ? { titulo: 'Cadastro aberto', status: 'erro', detalhe: 'Qualquer pessoa com o endereço pode criar uma conta.',
          correcao: 'Supabase → Authentication → Sign In / Providers → desligue "Allow new users to sign up".' }
      : { titulo: 'Cadastro aberto', status: 'ok', detalhe: 'Desligado: só entra quem foi convidado.' }
  return {
    titulo: 'Supabase Auth',
    itens: [item, {
      titulo: 'Conferir no painel', status: 'alerta',
      detalhe: 'Estes itens não aparecem para o app: verificação em duas etapas (TOTP), Site URL e Redirect URLs, SMTP próprio.',
      correcao: 'Authentication → Multi-Factor (TOTP ligado); URL Configuration (Site URL e /** do app); Emails → SMTP Settings.',
    }],
  }
}

function grupoBanco(b: DiagnosticoBanco): Grupo {
  const faltando = Object.entries(b.funcoes).filter(([, ok]) => !ok).map(([f]) => f)
  return {
    titulo: 'Banco de dados',
    itens: [
      faltando.length === 0
        ? { titulo: 'Atualizações do banco', status: 'ok', detalhe: 'Todas aplicadas.' }
        : { titulo: 'Atualizações do banco', status: 'erro', detalhe: `Faltam: ${faltando.join(', ')}.`,
            correcao: 'No SQL Editor, rode atualizacoes-banco.sql.' },
      b.cargos_escudeiros === 12
        ? { titulo: 'Cargos dos Escudeiros', status: 'ok', detalhe: '12 cargos no catálogo.' }
        : { titulo: 'Cargos dos Escudeiros', status: 'alerta', detalhe: `${b.cargos_escudeiros} cargos no catálogo (esperado: 12).`,
            correcao: 'No SQL Editor, rode atualizacoes-banco.sql.' },
    ],
  }
}

function grupoAgendamentos(b: DiagnosticoBanco, agora: Date): Grupo {
  if (b.cron === null) {
    return { titulo: 'Agendamentos', itens: [{
      titulo: 'pg_cron', status: 'erro', detalhe: 'A extensão pg_cron não está ligada: os avisos saem só uma vez por dia.',
      correcao: ARQUIVO_AGENDAMENTO }] }
  }
  const itens: Item[] = []
  const despacho = b.cron.find((j) => j.nome === 'despachar-notificacoes')
  if (!despacho) {
    itens.push({ titulo: 'Despacho de avisos (a cada 5 min)', status: 'erro', detalhe: 'Não agendado: os avisos saem só uma vez por dia.',
                 correcao: ARQUIVO_AGENDAMENTO })
  } else if (!despacho.ativo) {
    itens.push({ titulo: 'Despacho de avisos (a cada 5 min)', status: 'erro', detalhe: 'Agendado, mas desligado.', correcao: ARQUIVO_AGENDAMENTO })
  } else if (!despacho.ultima_em) {
    itens.push({ titulo: 'Despacho de avisos (a cada 5 min)', status: 'alerta', detalhe: 'Agendado, ainda sem execução registrada.' })
  } else if (despacho.ultima_status === 'failed') {
    itens.push({ titulo: 'Despacho de avisos (a cada 5 min)', status: 'erro',
                 detalhe: `A última execução falhou (${haQuanto(despacho.ultima_em, agora)}).`, correcao: ARQUIVO_AGENDAMENTO })
  } else if (minutosDesde(despacho.ultima_em, agora) > 15) {
    itens.push({ titulo: 'Despacho de avisos (a cada 5 min)', status: 'alerta',
                 detalhe: `Última execução ${haQuanto(despacho.ultima_em, agora)}: deveria ser a cada 5 minutos.` })
  } else {
    itens.push({ titulo: 'Despacho de avisos (a cada 5 min)', status: 'ok', detalhe: `Última execução ${haQuanto(despacho.ultima_em, agora)}.` })
  }

  const http = b.ultima_resposta_http
  if (despacho) {
    if (!http) {
      itens.push({ titulo: 'Resposta do app ao despacho', status: 'alerta', detalhe: 'Nenhuma chamada registrada nas últimas horas.' })
    } else if (http.erro || http.status === null) {
      itens.push({ titulo: 'Resposta do app ao despacho', status: 'erro',
                   detalhe: `A chamada não chegou ao app (${haQuanto(http.em, agora)}): falha de rede ou tempo esgotado.`,
                   correcao: 'Confira o endereço do app em agendar-despacho-pronto.sql e rode de novo.' })
    } else if (http.status === 401) {
      itens.push({ titulo: 'Resposta do app ao despacho', status: 'erro',
                   detalhe: 'O app recusou a chamada (401): o segredo do agendamento é diferente do CRON_SECRET da Vercel.',
                   correcao: ARQUIVO_AGENDAMENTO })
    } else if (http.status >= 200 && http.status < 300) {
      itens.push({ titulo: 'Resposta do app ao despacho', status: 'ok', detalhe: `OK (${http.status}) ${haQuanto(http.em, agora)}.` })
    } else {
      itens.push({ titulo: 'Resposta do app ao despacho', status: 'erro', detalhe: `O app respondeu ${http.status} ${haQuanto(http.em, agora)}.`,
                   correcao: 'Veja os logs do deploy na Vercel (Logs, filtro /api/notificacoes/despachar).' })
    }
  }

  const limpeza = b.cron.find((j) => j.nome === 'limpar-dados-antigos')
  if (!limpeza) {
    itens.push({ titulo: 'Limpeza diária (LGPD)', status: 'alerta', detalhe: 'Não agendada: avisos antigos e registros de acesso não são apagados.',
                 correcao: 'No SQL Editor, rode atualizacoes-banco.sql.' })
  } else if (limpeza.ultima_status === 'failed') {
    itens.push({ titulo: 'Limpeza diária (LGPD)', status: 'erro', detalhe: `A última execução falhou (${haQuanto(limpeza.ultima_em!, agora)}).`,
                 correcao: 'SQL Editor: select * from cron.job_run_details order by start_time desc limit 5; e me mande a mensagem de erro.' })
  } else if (!limpeza.ultima_em) {
    itens.push({ titulo: 'Limpeza diária (LGPD)', status: 'ok', detalhe: 'Agendada; roda todo dia às 03h17.' })
  } else if (minutosDesde(limpeza.ultima_em, agora) > 26 * 60) {
    itens.push({ titulo: 'Limpeza diária (LGPD)', status: 'alerta', detalhe: `Última execução ${haQuanto(limpeza.ultima_em, agora)}: deveria ser diária.` })
  } else {
    itens.push({ titulo: 'Limpeza diária (LGPD)', status: 'ok', detalhe: `Última execução ${haQuanto(limpeza.ultima_em, agora)}.` })
  }
  return { titulo: 'Agendamentos', itens }
}

function grupoFila(b: DiagnosticoBanco, agora: Date): Grupo {
  const f = b.fila
  const ultima = f.ultima_enviada_em ? ` Último enviado ${haQuanto(f.ultima_enviada_em, agora)}.` : ''
  const itens: Item[] = [f.atrasadas > 0
    ? { titulo: 'Fila de avisos', status: 'erro', detalhe: `${f.atrasadas} aviso(s) atrasado(s) há mais de 15 minutos.${ultima}`,
        correcao: 'Veja o item "Despacho de avisos" acima.' }
    : { titulo: 'Fila de avisos', status: 'ok', detalhe: `${f.pendentes} aguardando o horário de envio.${ultima}` }]
  if (f.erros_24h > 0) {
    itens.push({ titulo: 'Falhas de envio (24 h)', status: 'alerta',
                 detalhe: `${f.erros_24h} aviso(s) com erro. Costuma ser um aparelho que desinstalou o app ou e-mail inválido.` })
  }
  return { titulo: 'Fila de avisos', itens }
}

function grupoEstrutura(b: DiagnosticoBanco): Grupo {
  const e = b.estrutura
  const itens: Item[] = []
  itens.push(e.administradores_com_login > 0
    ? { titulo: 'Administradores', status: 'ok', detalhe: `${e.administradores_com_login} com acesso.` }
    : { titulo: 'Administradores', status: 'erro', detalhe: 'Nenhum administrador aceitou o convite.' })
  const passos: [number, string, string][] = [
    [e.nucleos, 'Núcleo', 'Cadastre o núcleo (templo) em Administração → Novo núcleo.'],
    [e.locais, 'Locais', 'Cadastre ao menos um local (o templo) no núcleo.'],
    [e.organizacoes, 'Organizações', 'Cadastre a Loja, o Capítulo DeMolay, o Castelo e o Bethel.'],
  ]
  for (const [n, titulo, correcao] of passos) {
    itens.push(n > 0 ? { titulo, status: 'ok', detalhe: `${n} cadastrado(s).` } : { titulo, status: 'alerta', detalhe: 'Nenhum ainda.', correcao })
  }
  if (e.organizacoes > 0) {
    const sem = e.organizacoes - e.organizacoes_com_secretaria
    itens.push(sem === 0
      ? { titulo: 'Secretarias', status: 'ok', detalhe: 'Todas as organizações têm Secretaria.' }
      : { titulo: 'Secretarias', status: 'alerta', detalhe: `${sem} de ${e.organizacoes} organização(ões) sem Secretaria.`,
          correcao: 'Em Administração, use "Nomear Secretaria" em cada organização.' })
  }
  itens.push({ titulo: 'Pessoas com acesso', status: 'ok', detalhe: `${e.pessoas_com_login} no total.` })
  return { titulo: 'Implantação', itens }
}

export function avaliarDiagnostico(ent: Entrada): Grupo[] {
  const agora = ent.agora ?? new Date()
  const grupos = [grupoVercel(ent.ambiente, ent.host), grupoAuth(ent.cadastroAberto)]
  if (!ent.banco) {
    grupos.push({ titulo: 'Banco de dados', itens: [{
      titulo: 'Diagnóstico do banco', status: 'erro',
      detalhe: 'A função de diagnóstico não respondeu: a atualização mais recente do banco não foi aplicada.',
      correcao: 'No SQL Editor, rode diagnostico.sql (ou a migração 20260930000010_diagnostico.sql).' }] })
    return grupos
  }
  grupos.push(grupoBanco(ent.banco), grupoAgendamentos(ent.banco, agora), grupoFila(ent.banco, agora), grupoEstrutura(ent.banco))
  return grupos
}

export function resumo(grupos: Grupo[]): Record<StatusItem, number> {
  const r = { ok: 0, alerta: 0, erro: 0 }
  for (const g of grupos) for (const i of g.itens) r[i.status]++
  return r
}

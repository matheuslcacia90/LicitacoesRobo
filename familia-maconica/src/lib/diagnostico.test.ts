import { describe, expect, it } from 'vitest'
import { avaliarDiagnostico, haQuanto, resumo, type DiagnosticoBanco, type Entrada, type Grupo } from './diagnostico'

const agora = new Date('2026-10-01T12:00:00Z')
const antes = (min: number) => new Date(agora.getTime() - min * 60_000).toISOString()

const banco = (m: Partial<DiagnosticoBanco> = {}): DiagnosticoBanco => ({
  funcoes: { exportar_dados: true, limpar_dados_antigos: true, configurar_lembretes: true, metricas_piloto: true },
  cargos_escudeiros: 12,
  cron: [
    { nome: 'despachar-notificacoes', agenda: '*/5 * * * *', ativo: true, ultima_status: 'succeeded', ultima_em: antes(3) },
    { nome: 'limpar-dados-antigos', agenda: '17 6 * * *', ativo: true, ultima_status: 'succeeded', ultima_em: antes(300) },
  ],
  ultima_resposta_http: { status: 200, em: antes(3), erro: false },
  fila: { pendentes: 4, atrasadas: 0, ultima_enviada_em: antes(20), erros_24h: 0 },
  estrutura: { administradores: 1, administradores_com_login: 1, nucleos: 1, locais: 1, organizacoes: 4,
               organizacoes_com_secretaria: 4, pessoas_com_login: 30 },
  ...m,
})

const entrada = (m: Partial<Entrada> = {}): Entrada => ({
  ambiente: { serviceRole: true, vapidPublica: true, vapidPrivada: true, cronSecret: true, resend: true,
              siteUrl: 'https://familia-maconica.vercel.app' },
  host: 'familia-maconica.vercel.app',
  cadastroAberto: false,
  banco: banco(),
  agora,
  ...m,
})

const item = (g: Grupo[], titulo: string) => g.flatMap((x) => x.itens).find((i) => i.titulo === titulo)

describe('avaliarDiagnostico', () => {
  it('instalação completa: só o lembrete de conferir o painel fica em alerta', () => {
    const g = avaliarDiagnostico(entrada())
    expect(resumo(g).erro).toBe(0)
    expect(g.flatMap((x) => x.itens).filter((i) => i.status !== 'ok').map((i) => i.titulo)).toEqual(['Conferir no painel'])
  })

  it('aponta variáveis ausentes na Vercel sem depender do banco', () => {
    const g = avaliarDiagnostico(entrada({
      ambiente: { serviceRole: false, vapidPublica: true, vapidPrivada: false, cronSecret: false, resend: false, siteUrl: null },
      banco: null,
    }))
    expect(item(g, 'Chave de serviço do Supabase')?.status).toBe('erro')
    expect(item(g, 'Notificações push')?.status).toBe('erro')
    expect(item(g, 'Segredo do agendador')?.status).toBe('erro')
    expect(item(g, 'Endereço do app')?.status).toBe('erro')
    expect(item(g, 'Avisos por e-mail')?.status).toBe('alerta')
    expect(item(g, 'Diagnóstico do banco')?.correcao).toContain('diagnostico.sql')
  })

  it('avisa quando o acesso é por outro endereço (prévia) e ignora localhost', () => {
    expect(item(avaliarDiagnostico(entrada({ host: 'familia-maconica-abc.vercel.app' })), 'Endereço do app')?.status).toBe('alerta')
    expect(item(avaliarDiagnostico(entrada({ host: 'localhost:3000' })), 'Endereço do app')?.status).toBe('ok')
  })

  it('cadastro aberto no Supabase é erro', () => {
    expect(item(avaliarDiagnostico(entrada({ cadastroAberto: true })), 'Cadastro aberto')?.status).toBe('erro')
    expect(item(avaliarDiagnostico(entrada({ cadastroAberto: null })), 'Cadastro aberto')?.status).toBe('alerta')
  })

  it('segredo do agendamento diferente do CRON_SECRET (401) e despacho parado', () => {
    const g = avaliarDiagnostico(entrada({ banco: banco({
      ultima_resposta_http: { status: 401, em: antes(2), erro: false },
      cron: [{ nome: 'despachar-notificacoes', agenda: '*/5 * * * *', ativo: true, ultima_status: 'succeeded', ultima_em: antes(90) }],
      fila: { pendentes: 10, atrasadas: 6, ultima_enviada_em: null, erros_24h: 2 },
    }) }))
    expect(item(g, 'Resposta do app ao despacho')?.detalhe).toContain('CRON_SECRET')
    expect(item(g, 'Despacho de avisos (a cada 5 min)')).toMatchObject({ status: 'alerta', detalhe: expect.stringContaining('há 2 h') })
    expect(item(g, 'Limpeza diária (LGPD)')?.status).toBe('alerta')
    expect(item(g, 'Fila de avisos')).toMatchObject({ status: 'erro', detalhe: expect.stringContaining('6 aviso(s) atrasado(s)') })
    expect(item(g, 'Falhas de envio (24 h)')?.status).toBe('alerta')
  })

  it('sem pg_cron, pede para rodar o arquivo de agendamento', () => {
    const g = avaliarDiagnostico(entrada({ banco: banco({ cron: null, ultima_resposta_http: null }) }))
    expect(item(g, 'pg_cron')).toMatchObject({ status: 'erro', correcao: expect.stringContaining('agendar-despacho-pronto.sql') })
  })

  it('atualizações faltando e implantação por fazer', () => {
    const g = avaliarDiagnostico(entrada({ banco: banco({
      funcoes: { exportar_dados: true, limpar_dados_antigos: false, configurar_lembretes: true, metricas_piloto: false },
      cargos_escudeiros: 4,
      estrutura: { administradores: 1, administradores_com_login: 1, nucleos: 1, locais: 0, organizacoes: 4,
                   organizacoes_com_secretaria: 1, pessoas_com_login: 1 },
    }) }))
    expect(item(g, 'Atualizações do banco')?.detalhe).toBe('Faltam: limpar_dados_antigos, metricas_piloto.')
    expect(item(g, 'Cargos dos Escudeiros')?.status).toBe('alerta')
    expect(item(g, 'Locais')?.status).toBe('alerta')
    expect(item(g, 'Secretarias')?.detalhe).toBe('3 de 4 organização(ões) sem Secretaria.')
  })
})

describe('haQuanto', () => {
  it('escreve o tempo decorrido', () => {
    expect(haQuanto(antes(0.2), agora)).toBe('agora há pouco')
    expect(haQuanto(antes(12), agora)).toBe('há 12 min')
    expect(haQuanto(antes(180), agora)).toBe('há 3 h')
    expect(haQuanto(antes(60 * 24 * 3), agora)).toBe('há 3 dias')
  })
})

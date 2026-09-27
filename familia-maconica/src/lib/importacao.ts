// Leitura da planilha de membros (CSV exportado do Excel, Google Planilhas ou
// LibreOffice). Função pura: roda no navegador para a conferência e de novo no
// servidor na importação. As regras de cadastro continuam no banco.
import type { Papel } from './tipos'

export const LIMITE_LINHAS = 300

export type LinhaImportacao = {
  linha: number // número da linha na planilha (cabeçalho = 1)
  nome: string
  nascimento: string // AAAA-MM-DD
  email: string | null
  celular: string | null
  id_oficial: string | null
  papel: Papel
  resp_nome: string | null
  resp_email: string | null
  resp_celular: string | null
  resp_parentesco: string | null
}

export type ErroImportacao = { linha: number; mensagem: string }
export type Leitura = { linhas: LinhaImportacao[]; erros: ErroImportacao[]; erroGeral?: string }

type Campo = Exclude<keyof LinhaImportacao, 'linha'>

// Cabeçalhos aceitos (sem acento, minúsculos, espaços e _ tratados igual).
const SINONIMOS: Record<Campo, string[]> = {
  nome: ['nome', 'nome completo', 'membro'],
  nascimento: ['nascimento', 'data de nascimento', 'data nascimento', 'data_nascimento', 'dt nascimento'],
  email: ['email', 'e-mail', 'e mail'],
  celular: ['celular', 'telefone', 'whatsapp', 'fone'],
  id_oficial: ['id oficial', 'id', 'id demolay', 'cim', 'registro', 'matricula'],
  papel: ['papel', 'tipo'],
  resp_nome: ['responsavel', 'nome do responsavel', 'responsavel nome', 'resp nome'],
  resp_email: ['email do responsavel', 'e-mail do responsavel', 'responsavel email', 'resp email'],
  resp_celular: ['celular do responsavel', 'telefone do responsavel', 'responsavel celular', 'resp celular'],
  resp_parentesco: ['parentesco', 'resp parentesco'],
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_\s]+/g, ' ').trim()

// Separa linhas e colunas respeitando aspas ("Silva; Souza" e "" escapado).
function tabela(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, '')
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? ''
  const sep = ['\t', ';', ','].reduce((a, b) => (primeira.split(b).length > primeira.split(a).length ? b : a))
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i]
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"' && campo === '') aspas = true
    else if (c === sep) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i++
      linha.push(campo); linhas.push(linha); linha = []; campo = ''
    } else campo += c
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas
}

// Aceita 31/12/2010, 31-12-2010, 31/12/10 não (ambíguo) e 2010-12-31.
export function lerData(v: string): string | null {
  const s = v.trim()
  let a: number, m: number, d: number
  let r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (r) { d = +r[1]; m = +r[2]; a = +r[3] }
  else if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { a = +r[1]; m = +r[2]; d = +r[3] }
  else return null
  const dt = new Date(Date.UTC(a, m - 1, d))
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || a < 1900) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function lerPlanilha(texto: string): Leitura {
  const t = tabela(texto).filter((l) => l.some((c) => c.trim() !== ''))
  if (t.length < 2) return { linhas: [], erros: [], erroGeral: 'A planilha precisa de uma linha de cabeçalho e ao menos um membro.' }

  const cab = t[0].map(normalizar)
  const coluna = {} as Record<Campo, number>
  for (const campo of Object.keys(SINONIMOS) as Campo[]) {
    // O e-mail do responsável não pode "roubar" a coluna de e-mail do membro, nem o contrário.
    coluna[campo] = cab.findIndex((h) => SINONIMOS[campo].includes(h))
  }
  const faltando = (['nome', 'nascimento'] as Campo[]).filter((c) => coluna[c] < 0)
  if (faltando.length) {
    return { linhas: [], erros: [], erroGeral: `Faltam as colunas obrigatórias: ${faltando.join(' e ')}. Use o modelo.` }
  }
  if (t.length - 1 > LIMITE_LINHAS) {
    return { linhas: [], erros: [], erroGeral: `No máximo ${LIMITE_LINHAS} membros por importação. Divida a planilha.` }
  }

  const linhas: LinhaImportacao[] = []
  const erros: ErroImportacao[] = []
  const vistos = new Map<string, number>()
  t.slice(1).forEach((cels, i) => {
    const n = i + 2
    const val = (c: Campo) => (coluna[c] >= 0 ? (cels[coluna[c]] ?? '').trim() : '')
    const opc = (c: Campo) => val(c) || null
    const nome = val('nome')
    const nascimento = lerData(val('nascimento'))
    const email = opc('email')?.toLowerCase() ?? null
    const resp_email = opc('resp_email')?.toLowerCase() ?? null
    const papelTxt = normalizar(val('papel'))
    const problemas: string[] = []
    if (!nome) problemas.push('nome vazio')
    if (!nascimento) problemas.push(val('nascimento') ? `data de nascimento inválida ("${val('nascimento')}")` : 'data de nascimento vazia')
    if (email && !EMAIL.test(email)) problemas.push(`e-mail inválido ("${email}")`)
    if (resp_email && !EMAIL.test(resp_email)) problemas.push(`e-mail do responsável inválido ("${resp_email}")`)
    if (papelTxt && papelTxt !== 'membro' && papelTxt !== 'adulto') problemas.push('papel deve ser "membro" ou "adulto"')
    if (email) {
      if (vistos.has(email)) problemas.push(`e-mail repetido na linha ${vistos.get(email)}`)
      else vistos.set(email, n)
    }
    if (problemas.length) { erros.push({ linha: n, mensagem: problemas.join('; ') }); return }
    linhas.push({
      linha: n, nome, nascimento: nascimento!, email, celular: opc('celular'), id_oficial: opc('id_oficial'),
      papel: papelTxt === 'adulto' ? 'adulto' : 'membro',
      resp_nome: opc('resp_nome'), resp_email, resp_celular: opc('resp_celular'), resp_parentesco: opc('resp_parentesco'),
    })
  })
  return { linhas, erros }
}

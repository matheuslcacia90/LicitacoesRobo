import { describe, expect, it } from 'vitest'
import { lerData, lerPlanilha } from './importacao'

describe('lerData', () => {
  it('aceita formatos brasileiro e ISO e recusa datas impossíveis', () => {
    expect(lerData('05/03/2011')).toBe('2011-03-05')
    expect(lerData('5-3-2011')).toBe('2011-03-05')
    expect(lerData('2011-03-05')).toBe('2011-03-05')
    expect(lerData('31/02/2011')).toBeNull()
    expect(lerData('05/03/11')).toBeNull()
    expect(lerData('')).toBeNull()
  })
})

describe('lerPlanilha', () => {
  it('lê CSV do Excel brasileiro (ponto e vírgula, BOM, acentos no cabeçalho, aspas)', () => {
    const csv = '﻿Nome completo;Data de nascimento;E-mail;Responsável;E-mail do responsável;Parentesco\r\n'
      + '"Silva; João";05/03/2011;JOAO@ex.com;Carlos Silva;pai@ex.com;pai\r\n'
      + 'Pedro Souza;1980-01-20;pedro@ex.com;;;\r\n'
      + ';;;;;\r\n'
    const r = lerPlanilha(csv)
    expect(r.erroGeral).toBeUndefined()
    expect(r.erros).toEqual([])
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[0]).toMatchObject({
      linha: 2, nome: 'Silva; João', nascimento: '2011-03-05', email: 'joao@ex.com',
      resp_nome: 'Carlos Silva', resp_email: 'pai@ex.com', resp_parentesco: 'pai', papel: 'membro',
    })
    expect(r.linhas[1]).toMatchObject({ linha: 3, email: 'pedro@ex.com', resp_email: null })
  })

  it('aponta os erros por linha sem descartar as linhas boas', () => {
    const csv = 'nome,nascimento,email,papel\nAna,31/02/2010,ana@ex.com,\nBia,01/01/2010,bia@,\n'
      + 'Caio,01/01/1990,caio@ex.com,chefe\nDani,01/01/1990,caio@ex.com,adulto\nEli,01/01/1990,eli@ex.com,Adulto\n'
    const r = lerPlanilha(csv)
    expect(r.erros.map((e) => e.linha)).toEqual([2, 3, 4, 5])
    expect(r.erros[0].mensagem).toContain('data de nascimento inválida')
    expect(r.erros[1].mensagem).toContain('e-mail inválido')
    expect(r.erros[2].mensagem).toContain('papel')
    expect(r.erros[3].mensagem).toBe('e-mail repetido na linha 4')
    expect(r.linhas.map((l) => [l.linha, l.papel])).toEqual([[6, 'adulto']])
  })

  it('e-mail repetido e colunas obrigatórias', () => {
    const r = lerPlanilha('nome\tnascimento\temail\nA\t01/01/1990\tx@ex.com\nB\t01/01/1990\tX@ex.com\n')
    expect(r.erros).toEqual([{ linha: 3, mensagem: 'e-mail repetido na linha 2' }])
    expect(lerPlanilha('nome;email\nA;a@ex.com').erroGeral).toContain('nascimento')
    expect(lerPlanilha('nome;nascimento').erroGeral).toContain('ao menos um membro')
  })
})

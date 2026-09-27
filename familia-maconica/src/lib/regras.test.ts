import { describe, expect, it } from 'vitest'
import {
  deslocarMes, faixaEtaria, intervaloDoMes, isoDeBrasilia, mensagemErro, podeSilenciar,
  respostasPossiveis, validarSenha,
} from './regras'

describe('faixaEtaria (espelha app.faixa)', () => {
  const hoje = new Date('2026-09-26T12:00:00')
  it('classifica pelas faixas da seção 8-C', () => {
    expect(faixaEtaria('2015-01-01', hoje)).toBe('crianca')
    expect(faixaEtaria('2014-09-26', hoje)).toBe('adolescente') // 12 anos hoje
    expect(faixaEtaria('2014-09-27', hoje)).toBe('crianca')     // faz 12 amanhã
    expect(faixaEtaria('2010-09-26', hoje)).toBe('jovem')
    expect(faixaEtaria('2008-09-26', hoje)).toBe('adulto')
    expect(faixaEtaria(null, hoje)).toBe('adulto')
  })
})

describe('respostas e preferências', () => {
  it('respostas por tipo de evento', () => {
    expect(respostasPossiveis('reuniao')).toEqual(['confirmado', 'ausente'])
    expect(respostasPossiveis('individual')).toEqual(['ciente', 'concluido'])
    expect(respostasPossiveis('convite')).toEqual(['aceito', 'recusado'])
  })
  it('reunião não pode ser silenciada', () => {
    expect(podeSilenciar('reuniao')).toBe(false)
    expect(podeSilenciar('evento')).toBe(true)
  })
})

describe('senha', () => {
  it('mínimo de 8 caracteres com letras e números', () => {
    expect(validarSenha('abc123')).toMatch(/8 caracteres/)
    expect(validarSenha('abcdefgh')).toMatch(/letras e números/)
    expect(validarSenha('abcd1234')).toBeNull()
  })
})

describe('datas em Brasília', () => {
  it('converte horário local para UTC', () => {
    expect(isoDeBrasilia('2026-10-01', '19:30')).toBe('2026-10-01T22:30:00.000Z')
    expect(() => isoDeBrasilia('01/10/2026', '19:30')).toThrow()
  })
  it('intervalo do mês e navegação', () => {
    const { de, ate } = intervaloDoMes('2026-12')
    expect(de).toBe('2026-12-01T03:00:00.000Z')
    expect(ate).toBe('2027-01-01T03:00:00.000Z')
    expect(deslocarMes('2026-12', 1)).toBe('2027-01')
    expect(deslocarMes('2026-01', -1)).toBe('2025-12')
  })
})

describe('mensagens de erro', () => {
  it('traduz erros técnicos', () => {
    expect(mensagemErro({ message: 'permission denied for table pessoa' })).toMatch(/permissão/)
    expect(mensagemErro({ message: 'Informe o nome.' })).toBe('Informe o nome.')
  })
})

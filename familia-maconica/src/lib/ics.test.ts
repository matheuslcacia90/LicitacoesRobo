import { describe, expect, it } from 'vitest'
import { dobrar, escapar, gerarCalendario, type EventoCalendario } from './ics'

const ev = (m: Partial<EventoCalendario> = {}): EventoCalendario => ({
  id: '11111111-2222-3333-4444-555555555555', titulo: 'Reunião ordinária', inicio: '2026-10-07T22:30:00Z',
  fim: '2026-10-08T00:30:00Z', local: 'Templo', organizacao: 'Loja Exemplo', cancelado: false,
  atualizado_em: '2026-10-01T12:00:00Z', ...m,
})

describe('gerarCalendario', () => {
  it('gera um VEVENT por evento, em UTC, sem descrição do evento', () => {
    const ics = gerarCalendario([ev(), ev({ id: 'x', titulo: 'Sessão; magna, aberta' })], new Date('2026-10-01T13:00:00Z'))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('DTSTART:20261007T223000Z')
    expect(ics).toContain('UID:11111111-2222-3333-4444-555555555555@familia-maconica')
    expect(ics).toContain('SUMMARY:Sessão\\; magna\\, aberta')
    expect(ics).toContain('LOCATION:Templo')
    expect(ics).toContain('DESCRIPTION:Loja Exemplo')
    expect(ics).toContain('STATUS:CONFIRMED')
  })

  it('evento cancelado sai como cancelado e a alteração muda o SEQUENCE', () => {
    const antes = gerarCalendario([ev()])
    const depois = gerarCalendario([ev({ cancelado: true, atualizado_em: '2026-10-02T12:00:00Z' })])
    expect(depois).toContain('STATUS:CANCELLED')
    expect(depois).toContain('SUMMARY:Cancelado: Reunião ordinária')
    const seq = (s: string) => Number(/SEQUENCE:(\d+)/.exec(s)![1])
    expect(seq(depois)).toBeGreaterThan(seq(antes))
  })

  it('calendário vazio continua válido', () => {
    const ics = gerarCalendario([])
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).not.toContain('VEVENT')
  })
})

describe('dobrar', () => {
  it('quebra linhas acima de 75 bytes sem partir caracteres acentuados', () => {
    const linha = 'SUMMARY:' + 'ç'.repeat(60)
    const partes = dobrar(linha).split('\r\n')
    expect(partes.length).toBeGreaterThan(1)
    for (const p of partes) expect(Buffer.byteLength(p)).toBeLessThanOrEqual(75)
    expect(partes.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(linha)
  })

  it('escapa quebras de linha e barras', () => {
    expect(escapar('a\\b\nc')).toBe('a\\\\b\\nc')
  })
})

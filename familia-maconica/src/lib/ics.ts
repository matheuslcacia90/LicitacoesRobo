// Formato iCalendar (RFC 5545), usado pelo .ics do evento público e pelo
// link de assinatura da agenda.

export function dataIcs(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function escapar(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
}

// Linhas com mais de 75 bytes continuam na linha seguinte, começando com espaço.
export function dobrar(linha: string): string {
  const partes: string[] = []
  let atual = ''
  let bytes = 0
  for (const c of linha) {
    const n = Buffer.byteLength(c)
    if (bytes + n > (partes.length ? 74 : 75)) {
      partes.push(atual)
      atual = ''
      bytes = 0
    }
    atual += c
    bytes += n
  }
  partes.push(atual)
  return partes.join('\r\n ')
}

export type EventoCalendario = {
  id: string
  titulo: string
  inicio: string
  fim: string
  local: string | null
  organizacao: string
  cancelado: boolean
  atualizado_em: string
}

export function gerarCalendario(eventos: EventoCalendario[], agora: Date = new Date()): string {
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Familia Maconica//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Família Maçônica', 'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT4H', 'X-PUBLISHED-TTL:PT4H',
  ]
  for (const e of eventos) {
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@familia-maconica`,
      `DTSTAMP:${dataIcs(agora.toISOString())}`,
      `LAST-MODIFIED:${dataIcs(e.atualizado_em)}`,
      // Muda a cada alteração do evento, para o calendário trocar horário ou cancelar.
      `SEQUENCE:${Math.floor(new Date(e.atualizado_em).getTime() / 1000) - 1_700_000_000}`,
      `DTSTART:${dataIcs(e.inicio)}`,
      `DTEND:${dataIcs(e.fim)}`,
      `SUMMARY:${escapar(e.cancelado ? `Cancelado: ${e.titulo}` : e.titulo)}`,
      ...(e.local ? [`LOCATION:${escapar(e.local)}`] : []),
      `DESCRIPTION:${escapar(e.organizacao)}`,
      `STATUS:${e.cancelado ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    )
  }
  linhas.push('END:VCALENDAR', '')
  return linhas.map(dobrar).join('\r\n')
}

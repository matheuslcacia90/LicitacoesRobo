'use client'

export function BotaoImprimir() {
  return <button type="button" onClick={() => window.print()}>Imprimir ou salvar em PDF</button>
}

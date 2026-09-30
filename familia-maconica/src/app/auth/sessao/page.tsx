import { CapturarSessao } from '@/componentes/CapturarSessao'

export const metadata = { title: 'Validando link' }

export default function Sessao() {
  return (
    <main className="estreita">
      <h1>Família Maçônica</h1>
      <CapturarSessao obrigatorio />
    </main>
  )
}

import Link from 'next/link'
import { CapturarSessao } from '@/componentes/CapturarSessao'
import { Formulario } from '@/componentes/Formulario'
import { entrar } from './acoes'

export const metadata = { title: 'Entrar' }

export default async function Entrar({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams
  return (
    <main className="estreita">
      <h1>Família Maçônica</h1>
      <p className="suave">Loja · DeMolay · Escudeiros · Filhas de Jó</p>
      {/* Convite feito pelo painel do Supabase cai aqui com a sessão no #fragmento. */}
      <CapturarSessao />
      {link === 'expirado' && (
        <p className="aviso info">
          O link expirou ou já foi usado. Peça à Secretaria para reenviar o convite, ou use “Esqueci a senha”.
        </p>
      )}
      <Formulario acao={entrar} rotulo="Entrar">
        <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
        <label>Senha<input name="senha" type="password" autoComplete="current-password" required /></label>
      </Formulario>
      <p className="suave">
        <Link href="/recuperar">Esqueci a senha</Link> · O primeiro acesso é feito pelo link de convite
        enviado pela Secretaria da sua organização.
      </p>
    </main>
  )
}

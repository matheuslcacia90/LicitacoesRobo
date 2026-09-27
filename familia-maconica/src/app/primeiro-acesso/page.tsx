import { redirect } from 'next/navigation'
import { Formulario } from '@/componentes/Formulario'
import { clienteServidor } from '@/lib/supabase/servidor'
import { definirSenha } from '../entrar/acoes'

export const metadata = { title: 'Criar senha' }

export default async function PrimeiroAcesso() {
  const sb = await clienteServidor()
  const { data } = await sb.auth.getClaims()
  if (!data) redirect('/entrar?link=expirado')

  return (
    <main className="estreita">
      <h1>Crie sua senha</h1>
      <p className="suave">
        Mínimo de 8 caracteres, com letras e números. Ninguém da Secretaria vê ou define sua senha.
      </p>
      <Formulario acao={definirSenha} rotulo="Salvar senha">
        <label>Nova senha<input name="senha" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label>Repita a senha<input name="confirmacao" type="password" autoComplete="new-password" minLength={8} required /></label>
      </Formulario>
    </main>
  )
}

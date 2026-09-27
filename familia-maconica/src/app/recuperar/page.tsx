import Link from 'next/link'
import { Formulario } from '@/componentes/Formulario'
import { recuperar } from '../entrar/acoes'

export const metadata = { title: 'Recuperar senha' }

export default function Recuperar() {
  return (
    <main className="estreita">
      <h1>Recuperar senha</h1>
      <Formulario acao={recuperar} rotulo="Enviar link">
        <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
      </Formulario>
      <p><Link href="/entrar">Voltar</Link></p>
    </main>
  )
}

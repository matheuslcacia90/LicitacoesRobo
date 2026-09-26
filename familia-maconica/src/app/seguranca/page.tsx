import { redirect } from 'next/navigation'
import { obterPerfil, precisaDoisFatores } from '@/lib/sessao'
import { DoisFatores } from './DoisFatores'

export const metadata = { title: 'Verificação em duas etapas' }

export default async function Seguranca() {
  const perfil = await obterPerfil()
  if (!perfil) redirect('/entrar')
  if (!perfil.pessoa.conta_ativa) redirect('/conta-inativa')
  const obrigatoria = precisaDoisFatores(perfil)

  return (
    <main className="estreita">
      <h1>Verificação em duas etapas</h1>
      {obrigatoria ? (
        <p className="aviso info">
          Como você acessa dados de outras pessoas (Secretaria ou administração), a verificação em duas etapas é
          obrigatória.
        </p>
      ) : (
        <p className="suave">Opcional, mas recomendada: além da senha, um código do aplicativo autenticador.</p>
      )}
      <DoisFatores obrigatoria={obrigatoria} />
    </main>
  )
}

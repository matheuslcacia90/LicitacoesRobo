import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Abas } from '@/componentes/Abas'
import { exigirPerfilAtivo, precisaDoisFatores } from '@/lib/sessao'
import { clienteServidor } from '@/lib/supabase/servidor'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfilAtivo()
  const sb = await clienteServidor()

  // Verificação em duas etapas obrigatória para Secretarias e administradores.
  if (precisaDoisFatores(perfil)) {
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
    if (data?.currentLevel !== 'aal2') redirect('/seguranca')
  }
  // Só o dia do acesso, para a métrica de uso semanal do piloto.
  await sb.rpc('registrar_acesso')

  const secretaria = perfil.vinculos.some((v) => v.secretaria)
  const cargos = perfil.pessoa.faixa !== 'crianca' && perfil.vinculos.length > 0

  return (
    <>
      <header className="topo">
        <Link href="/">Família Maçônica</Link>
        <Link href="/notificacoes" className="sino" aria-label={`Avisos (${perfil.nao_lidas} não lidos)`}>
          Avisos{perfil.nao_lidas > 0 && <span className="contador">{perfil.nao_lidas}</span>}
        </Link>
      </header>
      <main className="pagina">{children}</main>
      <Abas cargos={cargos} secretaria={secretaria} admin={perfil.admin} />
    </>
  )
}

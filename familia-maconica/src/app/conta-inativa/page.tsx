import { redirect } from 'next/navigation'
import { obterPerfil } from '@/lib/sessao'

export const metadata = { title: 'Conta inativa' }

export default async function ContaInativa() {
  const perfil = await obterPerfil()
  if (!perfil) redirect('/entrar')
  if (perfil.pessoa.conta_ativa) redirect('/')

  return (
    <main className="estreita">
      <h1>Olá, {perfil.pessoa.nome.split(' ')[0]}</h1>
      {perfil.pessoa.aguardando_aprovacao ? (
        <p className="aviso info">
          Sua conta está aguardando a aprovação do seu responsável. Peça a ele para entrar no app,
          abrir <strong>Perfil → Dependentes</strong> e aprovar seu acesso.
        </p>
      ) : (
        <p className="aviso info">
          Sua conta não tem vínculo ativo com nenhuma organização. Se isso for um engano, fale com a
          Secretaria da sua organização.
        </p>
      )}
      <p><a href="/meus-dados" download>Baixar meus dados</a></p>
      <form action="/sair" method="post"><button className="secundario">Sair</button></form>
    </main>
  )
}

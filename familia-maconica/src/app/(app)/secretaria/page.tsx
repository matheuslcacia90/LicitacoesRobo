import Link from 'next/link'
import { redirect } from 'next/navigation'
import { exigirPerfilAtivo } from '@/lib/sessao'
import { NOME_TIPO_ORGANIZACAO } from '@/lib/regras'

export const metadata = { title: 'Secretaria' }

export default async function Secretaria() {
  const perfil = await exigirPerfilAtivo()
  const orgs = perfil.vinculos.filter((v) => v.secretaria)
  if (orgs.length === 0) redirect('/')
  if (orgs.length === 1) redirect(`/secretaria/${orgs[0].organizacao_id}`)
  return (
    <>
      <h1>Secretaria</h1>
      {orgs.map((o) => (
        <Link key={o.organizacao_id} href={`/secretaria/${o.organizacao_id}`} className="cartao" style={{ display: 'block', textDecoration: 'none' }}>
          <strong>{o.organizacao}</strong>
          <p className="suave" style={{ margin: 0 }}>{NOME_TIPO_ORGANIZACAO[o.tipo]}</p>
        </Link>
      ))}
    </>
  )
}

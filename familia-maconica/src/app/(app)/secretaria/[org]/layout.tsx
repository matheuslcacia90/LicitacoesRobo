import { notFound } from 'next/navigation'
import { SubNav } from '@/componentes/SubNav'
import { ehSecretariaDe, exigirPerfilAtivo } from '@/lib/sessao'

export default async function LayoutSecretaria({ children, params }: {
  children: React.ReactNode
  params: Promise<{ org: string }>
}) {
  const { org } = await params
  const perfil = await exigirPerfilAtivo()
  if (!ehSecretariaDe(perfil, org)) notFound()
  const nome = perfil.vinculos.find((v) => v.organizacao_id === org)!.organizacao
  const base = `/secretaria/${org}`
  return (
    <>
      <p className="suave" style={{ margin: '0 0 4px' }}>Secretaria</p>
      <h1>{nome}</h1>
      <SubNav itens={[
        { href: base, rotulo: 'Membros', exato: true },
        { href: `${base}/cargos`, rotulo: 'Cargos e gestões' },
        { href: `${base}/agenda`, rotulo: 'Agenda' },
        { href: '/metricas', rotulo: 'Métricas' },
      ]} />
      {children}
    </>
  )
}

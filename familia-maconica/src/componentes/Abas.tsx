'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Abas({ cargos, secretaria, admin }: { cargos: boolean; secretaria: boolean; admin: boolean }) {
  const atual = usePathname()
  const itens = [
    { href: '/', rotulo: 'Início' },
    { href: '/agenda', rotulo: 'Agenda' },
    ...(cargos ? [{ href: '/cargos', rotulo: 'Cargos' }] : []),
    ...(secretaria ? [{ href: '/secretaria', rotulo: 'Secretaria' }] : []),
    ...(admin ? [{ href: '/admin', rotulo: 'Admin' }] : []),
    { href: '/perfil', rotulo: 'Perfil' },
  ]
  return (
    <nav className="abas" aria-label="Navegação principal">
      {itens.map((i) => {
        const ativo = i.href === '/' ? atual === '/' : atual.startsWith(i.href)
        return (
          <Link key={i.href} href={i.href} aria-current={ativo ? 'page' : undefined}>{i.rotulo}</Link>
        )
      })}
    </nav>
  )
}

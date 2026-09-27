'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SubNav({ itens }: { itens: { href: string; rotulo: string; exato?: boolean }[] }) {
  const atual = usePathname()
  return (
    <nav className="navegacao-secundaria">
      {itens.map((i) => {
        const ativo = i.exato ? atual === i.href : atual.startsWith(i.href)
        return <Link key={i.href} href={i.href} aria-current={ativo ? 'page' : undefined}>{i.rotulo}</Link>
      })}
    </nav>
  )
}
